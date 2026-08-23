#!/usr/bin/env node
/*
 * tools/probe_party_size.js — 実装依頼書 #14「パーティ 5 人以上の可否調査」の測定装置
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⚠ これは **調査チケットの装置**。本番の挙動は 1 ビットも変えない。
 *   `tavern.html` の devPartySizeOverride() は ?party 無指定では **恒等**で、
 *   このファイルの受入条件 1. がそれを 6 シナリオぶん機械的に検査する。
 *
 *   node tools/probe_party_size.js              # 本番 (受入条件 1. / 3. + 装置)
 *   node tools/probe_party_size.js --negative   # 負のコントロール (受入条件 2.)
 *   オプション: --port N --browser <exe> --headful
 *   exit 0=期待どおり / 1=assert が落ちた or 負のコントロールが空回り / 2=環境不足 / 3=装置の故障
 *
 * ── 実装状況 (STEP ごとに足していく骨組み) ──────────────────────────────────
 *   ✅ 受入条件 1. 既定が本番と 1 ビットも変わらない            … §2   (STEP1 = 本ファイルの初版)
 *   ✅ 受入条件 2. 負のコントロールを道具に内蔵 (--negative)     … §4   (STEP1)
 *   ✅ 受入条件 3. 母集団ガード (実体の配列長 + 到達数)          … §3   (STEP1)
 *   ✅ 受入条件 4. スポーンタイル                               … §5   (STEP2)
 *   ✅ 受入条件 5. 隊列順と zone                                … §6   (STEP2)
 *   ✅ 受入条件 6. 下部 HP ミニバーの枠                          … §7   (STEP2)
 *   ⬜ 受入条件 7. カメラ / 主人公が画面外のフレーム率           … §8   (STEP3)
 *   ⬜ 受入条件 8. カメラ / クランプ区間が空に落ちた率           … §9   (STEP3)
 *   ⬜ 受入条件 9. 置き去りと救済                               … §10  (STEP3)
 *   ⬜ 受入条件 10. 描画コスト                                  … §11  (STEP3)
 *   ⬜ 受入条件 11. 既存 golden の非退行                        … §12  (STEP4)
 *   ⬜ 受入条件 12. 依頼書への「実装結果」節                     … §13  (STEP4)
 *
 * ── ⛔⛔ 測定台の作り方 (#8 が実際に踏んだ罠) ───────────────────────────────
 *   index.html を直接開く測定台を作らないこと。isRecruitOn() / recruitCountOf() /
 *   devPartySizeOverride() は **tavern.html にしか無い**ので、index 直起動の腕は
 *   人数の指定が一切効かず全部 4 人になる = 腕が割れない (「差が出なかった」ではなく
 *   「同じものを 2 回測った」)。
 *   → 正しい腕は「酒場を本番どおり通して departToScenario() まで走らせる」。
 *     腕の起動部は tools/sweep_recruit_balance.js から流用した (作り直していない)。
 *
 * ── ⭐⭐⭐ 判定本体は 1 本だけ (受入条件 1. と 2. が共有する) ─────────────────
 *   「シームが恒等でなくなったら赤くなる」は、**assert 本体を共有しないと空振りする**
 *   (OFF 用に別の判定を書くと、両方が同じ誤りのとき永久に緑)。
 *   → 判定は judgeIdentity() ただ 1 本。本番モードは ok===true を、--negative は
 *     **同じ関数の** ok===false を要求する。緑のままなら exit 1。
 *   ⚠ STEP2 で足した §5〜§7 は --negative では走らせない。変異が書き換えるのは
 *     devPartySizeOverride の「raw === null」枝 = ?party 無指定でしか通らない枝で、
 *     これらの節は必ず ?party=N を渡すため**原理的に届かない**。「届かない」ことは
 *     (4d) が同じ観測で機械的に判定しているので、混ぜても信号は 1 ビットも増えない。
 *
 * ── ⚠⚠⚠ 母集団ガード (受入条件 3.) ─────────────────────────────────────────
 *   「違反 0 件」は母集団が 0 でも 0 件になる (2026-08-23 に ?doors=0 の腕が対象ノードへ
 *   一度も到達せず、空振りを緑と読み違えた)。→ **到達数をログの先頭に出す**。
 *   到達 = departToScenario() が sessionStorage["dragonfighters.partyMembers"] へ
 *   **実体の配列**を書いた走行。ドライバは配列長を写経せず本番に書かせる。
 *
 * ── ⚠ 踏みやすい罠 (既存ドライバから引き継ぎ) ──────────────────────────────
 *  - window.<名前> で classic script 直下の let/const/function を読まない (常に undefined)。
 *    page.evaluate の中の **裸の識別子**なら読める。
 *  - same-origin の storage はページ遷移をまたいで生き残る → document-start で purge。
 *    ⚠ purge は 1 タブ 1 回だけ (evaluateOnNewDocument は遷移のたびに再実行される)。
 *  - ROOT は必ず path.resolve を通す (区切り文字のままだと全 404。症状はタイムアウトだけ)。
 *  - MIME テーブルを落とすと全 500 でページが空になる (シームが undefined に見える)。
 *  - 変異は**ディスクを書き換えず配信を差し替える** (復元漏れが原理的に起きない)。
 *    置換は 1 行に収める (tavern.html は CRLF なので複数行アンカーは行末で外れる)。
 */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

/* ⚠ path.resolve 必須 (でないと全 404) */
const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg  = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const has  = (n) => argv.includes('--' + n);

const PORT     = parseInt(arg('port', '9345'), 10);
const HEADFUL  = has('headful');
const NEGATIVE = has('negative');

/* ══════════════════════════════════════════════════════════════════════════
 * 負のコントロールの変異 — 「シームが恒等でなくなる」を作る
 *   devPartySizeOverride() の「?party 未指定 = そのまま返す」枝だけを +1 にする。
 *   ⭐ 条件を裏返さない (=== を !== にする類は別物を測ってしまう)。ここは戻り値だけを変える。
 *   ⚠ アンカーが 1 箇所ちょうどでなければ装置の故障として exit 3 (黙って空振りさせない)。
 * ══════════════════════════════════════════════════════════════════════════ */
const MUT_FROM = '    if (raw === null) return n;   // 未指定 = 恒等。本番が必ず通る枝 (負のコントロールのアンカー: 揃えるな)';
const MUT_TO   = '    if (raw === null) return n + 1;   // [negative] 恒等でなくする (配信のみ・ディスクは無傷)';

/* ══════════════════════════════════════════════════════════════════════════
 * 期待表 — 依頼書 #7 の表そのもの。⚠ tavern.html の clamp を写経したものではない。
 *   ★の数はページから読んだ sc.difficulty と突き合わせるので、仕様を変えれば赤くなる。
 * ══════════════════════════════════════════════════════════════════════════ */
const SCENARIO_IDS = ['goblin-mine', 'bandits-forest', 'lizard-swamp', 'orc-fort', 'undead-temple', 'dragon-lair'];
const EXPECTED_NPC = {
  'goblin-mine':    1,   /* 星 1        */
  'bandits-forest': 2,   /* 星 2        */
  'lizard-swamp':   2,   /* 星 2        */
  'orc-fort':       3,   /* 星 3        */
  'undead-temple':  3,   /* 星 3        */
  'dragon-lair':    3,   /* 星 4 だが clamp(n,1,3) */
};
const EXPECTED_STARS = {
  'goblin-mine': 1, 'bandits-forest': 2, 'lizard-swamp': 2,
  'orc-fort': 3, 'undead-temple': 3, 'dragon-lair': 4,
};

/* 調査シームで指定する人数 (装置の対照群)。⚠ これは本番の上限ではない (clamp は無改修)。 */
const PROBE_N = 5;

/* ══════════════════════════════════════════════════════════════════════════
 * ⭐⭐⭐ 判定本体 (Node 側・純関数)。受入条件 1. と 受入条件 2. が **これ 1 本を共有**する。
 *   rows      : observeDepart() の戻り値 (経路 A = 実際に起きた側 = sessionStorage の実体)
 *   expected  : { id: 期待 NPC 数 }
 *   ok は「6 件すべてが期待どおり」。母集団が空 (rows=[]) のときは **false**
 *   (空で緑になる測定器を作らない)。
 * ══════════════════════════════════════════════════════════════════════════ */
function judgeIdentity(rows, expected) {
  const ids = Object.keys(expected);
  const diffs = [];
  ids.forEach((id) => {
    const r = (rows || []).find((x) => x.id === id);
    if (!r)               { diffs.push(id + ': 観測なし'); return; }
    if (r.wrote !== true) { diffs.push(id + ': 出発処理が partyMembers を書いていない'); return; }
    if (!r.isArray)       { diffs.push(id + ': partyMembers が配列でない'); return; }
    if (r.npc !== expected[id]) diffs.push(id + ': NPC ' + r.npc + ' (期待 ' + expected[id] + ')');
  });
  return { ok: ids.length > 0 && (rows || []).length === ids.length && diffs.length === 0, diffs };
}

/* 「N 人ちょうどで出発した」の判定 (装置の対照群 = シームが生きている証明)。 */
function judgeFixedTotal(rows, total) {
  const bad = (rows || []).filter((r) => !(r.wrote && r.isArray && r.total === total))
    .map((r) => r.id + ':計' + r.total + '人');
  return { ok: (rows || []).length > 0 && bad.length === 0, bad };
}

/* ══════════════════════════════════════════════════════════════════════════ */
const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: detail === undefined ? '' : String(detail) });
  console.log((cond ? '  OK  ' : '  NG  ') + name + (detail !== undefined ? '  -- ' + detail : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pageErrors = [];

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
        /* 変異は配信の差し替えで行う (ディスクは 1 バイトも触らない) */
        if (NEGATIVE && u === '/tavern.html') {
          const body = fs.readFileSync(fp, 'utf8').replace(MUT_FROM, MUT_TO);
          res.end(body); return;
        }
        fs.createReadStream(fp).pipe(res);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    srv.on('error', reject);
    srv.listen(port, () => resolve(srv));
  });
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let b = ''; res.setEncoding('utf8');
      res.on('data', (c) => { b += c; });
      res.on('end', () => resolve(b));
    }).on('error', reject);
  });
}

/* ══════════════════════════════════════════════════════════════════════════
 * ページ側の観測本体。**本番の関数だけ**を呼ぶ (写経しない):
 *   prepScenario = sc          ← openPrep(sc) が最初にやることと同じ
 *   regeneratePartyMembers()   ← 本番の再抽選 (この中に調査シームが 1 行入っている)
 *   departToScenario()         ← 本番の出発処理 (sessionStorage へ書くのはこの中)
 * ⚠ 「sessionStorage へ 2 行書く」をドライバに写経すると、出発処理を一度も通さないまま
 *   緑になる。書き込みは必ず本番に書かせ、ドライバは**書かれた実体**だけを読む。
 * ══════════════════════════════════════════════════════════════════════════ */
const OBSERVE = (idList) => {
  const out = { rows: [], threw: '', partySize: null, seam: {} };
  try {
    /* ── 裸の識別子でしか読めない (window.<名前> は常に undefined) ── */
    out.seam = {
      scenarios:            typeof scenarios,
      PARTY_SIZE:           typeof PARTY_SIZE,
      recruitCountOf:       typeof recruitCountOf,
      isRecruitOn:          typeof isRecruitOn,
      devPartySizeOverride: typeof devPartySizeOverride,
      regenerate:           typeof regeneratePartyMembers,
      departToScenario:     typeof departToScenario,
      onWindowSeam:         typeof window.devPartySizeOverride,
      recruitOn:            (typeof isRecruitOn === 'function') ? isRecruitOn() : null,
      search:               location.search,
    };
    out.partySize = (typeof PARTY_SIZE === 'number') ? PARTY_SIZE : null;
    for (const id of idList) {
      const sc = (typeof scenarios !== 'undefined') ? scenarios.find((s) => s.id === id) : null;
      if (!sc) { out.rows.push({ id, missing: true, wrote: false, isArray: false, total: -1, npc: -1 }); continue; }
      prepScenario = sc;
      regeneratePartyMembers();
      sessionStorage.removeItem('dragonfighters.partyMembers');   /* 前周の値を残さない */
      departToScenario();
      const raw = sessionStorage.getItem('dragonfighters.partyMembers');
      let arr = null;
      try { arr = JSON.parse(raw); } catch (e) {}
      const okArr = Array.isArray(arr);
      out.rows.push({
        id,
        wrote:   raw !== null,
        isArray: okArr,
        total:   okArr ? arr.length : -1,
        npc:     okArr ? arr.length - 1 : -1,
        heroes:  okArr ? arr.filter((m) => m && m.isHero).length : -1,
        zones:   okArr ? arr.map((m) => m && m.zone).join('>') : '',
        stars:   (String(sc.difficulty || '').match(/★/g) || []).length,
        decided: (typeof recruitCountOf === 'function') ? recruitCountOf(sc) : null,   /* 経路 B */
      });
    }
  } catch (e) { out.threw = String((e && e.message) || e); }
  return out;
};

const dump = (rows) => rows.map((r) => r.id + '(星' + r.stars + ')=計' + r.total + '人/NPC' + r.npc).join('  ');

/* ══════════════════════════════════════════════════════════════════════════
 * STEP2 で足した測定 (受入条件 4. / 5. / 6.)
 * ──────────────────────────────────────────────────────────────────────────
 * ⭐ ここは **長時間プレイを一切しない**。departToScenario() で index へ着地した
 *   直後の 1 フレームで、本番の関数を呼んで幾何だけを採る。
 * ⚠ 判定は必ず Node 側の純関数 (judgeSpawn / judgeFormation / judgeMiniBar) に置き、
 *   「空の観測で落ちる」ことを装置 assert で毎回確かめる (§3 の (3c) と同じ作法)。
 * ══════════════════════════════════════════════════════════════════════════ */
const PROBE_N6      = 6;                             /* 受入条件 4./5. のもう一方の腕 */
const MINIBAR_NS    = [4, 5, 6];                     /* 受入条件 6. で実測する N (上限を跨ぐ範囲) */
const MINIBAR_VIEW  = { width: 390, height: 844 };   /* compact = iPhone 14 相当 */
const ZRANK         = { front: 0, mid: 1, rear: 2 };
const ZONE_NAMES    = ['front', 'mid', 'rear'];

/* ── 受入条件 5. の判定本体 (tavern 側の出力にも index 側の formation にも同じものを掛ける) ──
 *   rows : [{ id, zones: "front>mid>rear" }]
 *   ⚠ 母集団が空なら false。 */
function judgeFormation(rows, total) {
  const bad = [];
  (rows || []).forEach((r) => {
    const zs = String(r.zones || '').split('>').filter(Boolean);
    const tag = r.id + '[' + zs.join('>') + ']';
    if (zs.length !== total) { bad.push(tag + ': 人数 ' + zs.length + ' (期待 ' + total + ')'); return; }
    if (zs.some((z) => !(z in ZRANK))) { bad.push(tag + ': 未知の zone'); return; }
    for (let i = 1; i < zs.length; i++) {
      if (ZRANK[zs[i]] < ZRANK[zs[i - 1]]) { bad.push(tag + ': front->mid->rear の順序が崩れている'); return; }
    }
    if (zs[0] !== 'front') { bad.push(tag + ': [0] が front zone でない'); return; }
    const miss = ZONE_NAMES.filter((z) => zs.indexOf(z) < 0);
    if (miss.length) bad.push(tag + ': zone 欠落 ' + miss.join(','));
  });
  return { ok: (rows || []).length > 0 && bad.length === 0, bad };
}

/* ── 受入条件 4. の判定本体 ────────────────────────────────────────────────
 *   rows : SWEEP_SPAWN が返した 1 配置ぶんに腕の情報 (scen / n) を足したもの
 *          { scen, n, node, via, err, head:[tx,ty], tiles:[[tx,ty]..], walls:[bool..], overlap }
 *   (a) 全員が互いに別タイル (頭も含めて重複なし)  (b) isTileWall が全員 false
 *   (c) 「頭に重ねる」最終手段の枝に落ちた仲間が 0 人
 *   ⭐ (c) は index.html へ dev シームを足さずに測れる。両方の配置関数
 *     (resolveAllyInitTile / placeNodeParty) は **頭のタイルを taken の種にしてから**
 *     候補を回すので、仲間のタイルが頭と一致するのは最終手段の枝だけ
 *     (どちらの候補表にも [0,0] が無いことを実装で確認済み)。 */
function judgeSpawn(rows) {
  const bad = [];
  (rows || []).forEach((r) => {
    const tag = r.scen + '/N=' + r.n + '/' + r.node + '(via ' + r.via + ')';
    if (r.err) { bad.push(tag + ': 例外 ' + r.err); return; }
    if (!Array.isArray(r.tiles) || r.tiles.length !== r.n - 1) {
      bad.push(tag + ': 仲間 ' + ((r.tiles || []).length) + ' 人ぶんしか採れていない (期待 ' + (r.n - 1) + ')');
      return;
    }
    const keys = new Set();
    if (r.head) keys.add(r.head.join(','));
    let dup = 0;
    r.tiles.forEach((t) => { const k = t.join(','); if (keys.has(k)) dup++; keys.add(k); });
    if (dup > 0) bad.push(tag + ': (a) 同じタイルに ' + dup + ' 人重なった ' + JSON.stringify(r.tiles));
    const wall = (r.walls || []).filter(Boolean).length;
    if (wall > 0) bad.push(tag + ': (b) 壁の中に ' + wall + ' 人 ' + JSON.stringify(r.tiles));
    if (r.overlap > 0) {
      bad.push(tag + ': (c) 頭に重ねる枝に ' + r.overlap + ' 人 head=' + JSON.stringify(r.head)
        + ' tiles=' + JSON.stringify(r.tiles));
    }
  });
  return { ok: (rows || []).length > 0 && bad.length === 0, bad };
}

/* ── 受入条件 6. の判定本体 ────────────────────────────────────────────────
 *   rows : [{ n, innerW, collapsed, chips:[{retreat,w,minW}], clientW, scrollW, gapPx, err }]
 *   ⭐⭐⭐ ここでは **「N=6 は溢れる」といった予測を assert にしない**。測るのは
 *     ① 観測そのものが成立しているか ② 上限が測定範囲の内側にあるか (溢れた N と
 *     溢れなかった N が両方在る = 上限を実際に跨いだか) ③ 単調か。上限の値は**報告**する。
 *   ⚠ 依頼書 (受入条件 6.) の予測値 70.8 / 58.0 / 48.9px は `.hpChip.retreatChip` が
 *     `flex: 0 0 auto; min-width: 48px` = 伸縮しない固定枠であることを見落としている。
 *     予測に合わせて assert を書き換えず、実測を出す。 */
function judgeMiniBar(rows) {
  const bad = [];
  (rows || []).forEach((r) => {
    const tag = 'N=' + r.n;
    if (r.err) { bad.push(tag + ': ' + r.err); return; }
    if (r.innerW !== MINIBAR_VIEW.width) bad.push(tag + ': 画面幅 ' + r.innerW + ' (期待 ' + MINIBAR_VIEW.width + ')');
    if (!r.collapsed) bad.push(tag + ': body.ui-collapsed が付いていない = ミニバーが表示されていない');
    const chips = r.chips || [];
    if (chips.length !== r.n + 1) {
      bad.push(tag + ': チップ ' + chips.length + ' 枚 (期待 ' + (r.n + 1) + ' = 頭 + 仲間 + 撤退)');
      return;
    }
    if (chips.filter((c) => c.retreat).length !== 1) bad.push(tag + ': 撤退チップが 1 枚ではない');
    if (chips.some((c) => !(c.w > 0))) bad.push(tag + ': 実寸 0 のチップがある (描画されていない)');
  });
  return { ok: (rows || []).length > 0 && bad.length === 0, bad };
}
const overflowed    = (r) => r.scrollW > r.clientW + 0.5;
const retreatChipOf = (r) => (r.chips || []).find((c) => c.retreat) || null;
const partyChipsOf  = (r) => (r.chips || []).filter((c) => !c.retreat);
/* 実測値どうしの整合: 「左右 padding と撤退枠を先に引いてから残りを等分」を
   **測った値だけ**から導く。⚠ 依頼書の予測値 (定数) とは比べない。予測が誤っていても実測が正。
   ⚠⚠ clientWidth は **padding を含む** (border と scrollbar は含まない)。#hpMiniBar は
     padding: 4px 6px なので左右 12px を先に引かないと 1 チップあたり 3px ずれる
     (2026-08-23 に実際にずれて (7d) が赤くなった)。実測での検算:
       N=4 → (390 - 12 - 52.67 - 6x4) / 4 = 75.33px = 実測 75.33px
       N=5 → (390 - 12 - 52.67 - 6x5) / 5 = 59.07px = 実測 59.06px */
function partyChipPredicted(r) {
  const rt = retreatChipOf(r);
  if (!rt || !(r.clientW > 0)) return null;
  return (r.clientW - r.padL - r.padR - rt.w - r.gapPx * r.n) / r.n;
}

/* ══════════════════════════════════════════════════════════════════════════
 * ページ側 (酒場): 1 シナリオぶんだけ出発させる。§5/§7 の腕はここから index へ着地する。
 * ⚠ partyMembers を手で組まない。本番の regeneratePartyMembers() / departToScenario() が
 *   書いた実体だけを読む (OBSERVE と同じ約束)。
 * ══════════════════════════════════════════════════════════════════════════ */
const KICK_ONE = (sid) => {
  const out = { err: '', total: -1, npc: -1, zones: '' };
  try {
    const sc = (typeof scenarios !== 'undefined') ? scenarios.find((s) => s.id === sid) : null;
    if (!sc) { out.err = 'scenario not found: ' + sid; return out; }
    prepScenario = sc;
    regeneratePartyMembers();
    const pm = (selection && selection.partyMembers) || [];
    out.total = pm.length;
    out.npc   = pm.filter((m) => m && !m.isHero).length;
    out.zones = pm.map((m) => m && m.zone).join('>');
    departToScenario();
  } catch (e) { out.err = String((e && e.message) || e); }
  return out;
};

/* ══════════════════════════════════════════════════════════════════════════
 * ページ側 (index): 受入条件 4. の掃き出し。**本番の関数だけ**を呼ぶ。
 *   ① 起動時配置 = resolveAllyInitTile()  (index.html:31518。希望 1 個 + 代替 24 個)
 *   ② ノード遷移 = placeNodeParty(viaDir) (index.html:33230。enterNode の唯一の配置点)
 * ⭐⭐⭐ ② を落とすと調査が半分になる。仲間の配置点は 1 つではなく **2 つ**在り、
 *   起動時の 1 回を除く全部 (= 実プレイのほぼ全部) は ② が担っている。
 *   依頼書の前提表が名指ししているのは ① だけ。
 * ⚠ ① は生の allies[].x を読んではいけない。heroAI が既に歩かせた後の座標になる。
 *   **同じ初期状態 (種 = 頭の足元 1 タイルだけ) から本番の関数をもう一度回す**。
 * ⚠ ② の入口方向は手で並べない。グラフの辺から導く:
 *     辺 A --d--> B について、B は d で入られ、A は DIR_OPPOSITE[d] で入り直される
 *     (exitsWithReturn が親へ戻る口を DIR_OPPOSITE[nodeEnteredVia] で作るのと同じ規則)。
 * ⚠ buildNode は必ず resolveNodeMapDef() を通す (生の mapDef を渡すと sanitize / isCustom が
 *   付かず、1 枚絵が従来経路へ落ちて別物を測る — 2026-08-17 に実測済みの罠)。
 * ⚠ 裸の識別子でしか読めない (window.RUN は常に undefined)。
 * ══════════════════════════════════════════════════════════════════════════ */
const SWEEP_SPAWN = () => {
  const out = { err: '', scenarioId: null, entry: null, nodeCount: 0, allies: -1,
                zones: '', classKeys: '', startMatch: null, initial: null, rows: [] };
  try {
    if (typeof RUN === 'undefined' || !RUN || !RUN.graph || !Array.isArray(RUN.graph.nodes)) {
      out.err = 'RUN.graph.nodes が無い (分岐グラフで起動していない)';
      return out;
    }
    out.scenarioId = RUN.scenarioId;
    out.entry      = RUN.graph.entry;
    out.nodeCount  = RUN.graph.nodes.length;
    out.allies     = allies.length;
    out.zones      = formation.map((m) => m.zone).join('>');
    out.classKeys  = formation.map((m) => m.classKey).join(',');

    const allyTile = (a) => [
      Math.round((a.x + a.def.displaySize / 2 - TILE_SIZE / 2) / TILE_SIZE),
      Math.round((a.y + a.def.displaySize / 2 - TILE_SIZE / 2) / TILE_SIZE),
    ];

    /* ── ① 起動時配置 (resolveAllyInitTile) ───────────────────────────────
       装置ガード: 再実行は「起動時と同じ盤面」でしか意味が無い。PARTY_START_* は
       起動時に捕まえた const なので、今の START_* と一致していることを測って残す。 */
    out.startMatch = (PARTY_START_TX === START_TX && PARTY_START_TY === START_TY);
    allyInitTakenTiles.clear();
    allyInitTakenTiles.add(PARTY_START_TY * MAP_W + PARTY_START_TX);
    const init = { node: RUN.graph.entry, kind: 'start', via: '起動時 resolveAllyInitTile', err: '',
                   head: [PARTY_START_TX, PARTY_START_TY],
                   headWall: !!isTileWall(PARTY_START_TX, PARTY_START_TY),
                   tiles: [], walls: [], overlap: 0 };
    for (const m of formation.slice(1)) {
      const p = resolveAllyInitTile(m.classKey);
      init.tiles.push([p.tx, p.ty]);
      init.walls.push(!!isTileWall(p.tx, p.ty));
      if (p.tx === PARTY_START_TX && p.ty === PARTY_START_TY) init.overlap++;
    }
    out.initial = init;

    /* ── ② ノード遷移配置 (placeNodeParty) ──────────────────────────────── */
    const DIRS = {};
    const add = (id, d) => { if (!d) return; (DIRS[id] = DIRS[id] || {})[d] = 1; };
    for (const n of RUN.graph.nodes) {
      for (const ex of (n.exits || [])) {
        if (!ex || !ex.dir) continue;
        add(ex.to, ex.dir);                      /* 子へ前進して入る */
        add(n.id, DIR_OPPOSITE[ex.dir]);         /* 子から引き返して入り直す */
      }
    }
    for (const n of RUN.graph.nodes) {
      const dirs = Object.keys(DIRS[n.id] || {});
      if (!dirs.length) dirs.push('');           /* 入口の無いノード = 起点。entryDir なしで置く */
      for (const d of dirs) {
        const row = { node: n.id, kind: n.kind, via: d || 'entryDir なし', err: '',
                      head: null, headWall: null, tiles: [], walls: [], overlap: 0 };
        try {
          buildNode(resolveNodeMapDef(n.id), n.id);
          placeNodeParty(d || null);
          const ht = [Math.round((playerX - SNAP_X_OFFSET) / TILE_SIZE),
                      Math.round((playerY - SNAP_Y_OFFSET) / TILE_SIZE)];
          row.head = ht;
          row.headWall = !!isTileWall(ht[0], ht[1]);
          for (const a of allies) {
            if (!a) continue;
            const t = allyTile(a);
            row.tiles.push(t);
            row.walls.push(!!isTileWall(t[0], t[1]));
            if (t[0] === ht[0] && t[1] === ht[1]) row.overlap++;
          }
        } catch (e) { row.err = String((e && e.message) || e); }
        out.rows.push(row);
      }
    }
  } catch (e) { out.err = String((e && e.message) || e); }
  return out;
};

/* ══════════════════════════════════════════════════════════════════════════
 * ページ側 (index): 受入条件 6. 下部 HP ミニバーの実寸。
 * ⚠ 予測値をページへ持ち込まない。getBoundingClientRect() の実測と、導出に要る
 *   CSS の実測値 (gap / padding / clientWidth / scrollWidth) だけを返す。
 * ══════════════════════════════════════════════════════════════════════════ */
const MEASURE_MINIBAR = () => {
  const out = { err: '', allies: -1, innerW: -1, collapsed: false, compact: false,
                chips: [], clientW: -1, scrollW: -1, barW: -1, gapPx: -1, padL: -1, padR: -1 };
  try {
    out.allies    = (typeof allies !== 'undefined') ? allies.length : -1;
    out.innerW    = window.innerWidth;
    out.collapsed = !!(document.body && document.body.classList.contains('ui-collapsed'));
    out.compact   = !!(document.body && document.body.classList.contains('ui-compact'));
    const mini = document.getElementById('hpMiniBar');
    if (!mini) { out.err = '#hpMiniBar が無い'; return out; }
    const cs = getComputedStyle(mini);
    out.gapPx   = parseFloat(cs.gap || cs.columnGap || '0') || 0;
    out.padL    = parseFloat(cs.paddingLeft || '0') || 0;
    out.padR    = parseFloat(cs.paddingRight || '0') || 0;
    out.barW    = +mini.getBoundingClientRect().width.toFixed(2);
    out.clientW = mini.clientWidth;
    out.scrollW = mini.scrollWidth;
    out.chips = Array.prototype.map.call(mini.querySelectorAll('.hpChip'), (c) => ({
      retreat: c.classList.contains('retreatChip'),
      w:       +c.getBoundingClientRect().width.toFixed(2),
      minW:    parseFloat(getComputedStyle(c).minWidth || '0') || 0,
      name:    (c.querySelector('.chipName') || {}).textContent || '',
    }));
  } catch (e) { out.err = String((e && e.message) || e); }
  return out;
};

/* ══════════════════════════════════════════════════════════════════════════ */
(async () => {
  /* ── 装置の故障は先に落とす: 変異アンカーが 1 箇所ちょうどか ── */
  const tavSrc = fs.readFileSync(path.join(ROOT, 'tavern.html'), 'utf8');
  const anchorHits = tavSrc.split(MUT_FROM).length - 1;
  if (anchorHits !== 1) {
    console.error('[probe] 装置の故障: 変異アンカーが ' + anchorHits + ' 箇所 (1 でなければ負のコントロールが空回りする)');
    console.error('        アンカー: ' + MUT_FROM);
    process.exit(3);
  }

  const puppeteer = loadPuppeteer();
  const srv = await startServer(PORT);
  console.log('[probe] serving ' + ROOT + '  :' + PORT
    + (NEGATIVE ? '   ★負のコントロール (シームを恒等でなくして配信)' : ''));

  const profile = require('./_pptr_profile')('df_partysize_');
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--mute-audio', '--user-data-dir=' + profile],
    defaultViewport: { width: 1280, height: 900 },
  });

  /* ⚠ purge は「1 タブにつき 1 回だけ」。evaluateOnNewDocument は新しい document ができるたびに
     走るので、無条件だと遷移先で前ページの書き込みを消してしまう。 */
  const PURGE_MARK = '__dfProbePartyPurged';
  /* ⚠ 酒場だけの腕 (openTavern) と index まで着地する腕 (openIndexArm) で **同じ 1 本**を使う。
     2 本に写すと、片方だけ prologueSeen を立て忘れて「片方の腕だけ別のゲームを測る」になる。 */
  const PURGE_ON_NEW_DOC = (mark) => {
    try {
      if (sessionStorage.getItem(mark)) return;
      const kill = (store) => Object.keys(store).forEach((k) => {
        if (k.indexOf('df.') === 0) store.removeItem(k);
        if (k.indexOf('dragonfighters.') === 0) store.removeItem(k);
      });
      kill(localStorage); kill(sessionStorage);
      localStorage.setItem('dragonfighters.prologueSeen', '1');
      sessionStorage.setItem(mark, '1');
    } catch (e) {}
  };
  async function openTavern(query) {
    const page = await browser.newPage();
    const navBlocked = [];
    const consoleLines = [];
    page.__navBlocked = navBlocked;
    page.__console = consoleLines;
    page.on('pageerror', (e) => pageErrors.push(query + ' :: ' + e.message));
    page.on('console', (m) => { consoleLines.push(m.text()); });
    await page.evaluateOnNewDocument(PURGE_ON_NEW_DOC, PURGE_MARK);

    /* index.html への遷移だけ abort する。departToScenario() は本番のまま完走し、
       tavern.html のページ (と JS 状態) が生き残るので 6 シナリオを 1 タブで測れる。 */
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      try {
        if (r.isNavigationRequest() && r.frame() === page.mainFrame() && /\/index\.html/.test(r.url())) {
          navBlocked.push(r.url()); r.abort('aborted'); return;
        }
        r.continue();
      } catch (e) { try { r.continue(); } catch (e2) {} }
    });

    await page.goto('http://localhost:' + PORT + '/tavern.html' + query,
      { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(
      "typeof scenarios !== 'undefined' && typeof departToScenario === 'function'"
      + " && typeof regeneratePartyMembers === 'function' && typeof devPartySizeOverride === 'function'"
      + " && typeof selection !== 'undefined' && selection && Array.isArray(selection.partyComposition)",
      { timeout: 30000 });
    await sleep(500);
    return page;
  }

  /* ══════════════════════════════════════════════════════════════════════
   * §5 / §7 の腕 — 酒場を本番どおり通してから **index.html へ実際に着地する**。
   * ⛔⛔ index.html を直接開かないこと。isRecruitOn() / recruitCountOf() /
   *   devPartySizeOverride() は tavern.html にしか無いので、index 直起動の腕は
   *   人数の指定が一切効かず全部 4 人になる = 腕が割れない (#8 が実際に踏んだ)。
   * ⚠ openTavern と違い遷移を横取りしない (横取りすると index に着かない)。
   * ⚠ ?autoplay は付けない。autoplay は FX / カメラ追従 / ナレ / sleepMs 倍率まで
   *   一括で切るので、測る対象そのものが別物になる。
   * ══════════════════════════════════════════════════════════════════════ */
  async function openIndexArm(sid, n, viewport) {
    const page = await browser.newPage();
    const tag = sid + '/N=' + n;
    page.on('pageerror', (e) => pageErrors.push('index ' + tag + ' :: ' + e.message));
    await page.setViewport(viewport);
    await page.evaluateOnNewDocument(PURGE_ON_NEW_DOC, PURGE_MARK);
    await page.goto('http://localhost:' + PORT + '/tavern.html?party=' + n,
      { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(
      "typeof scenarios !== 'undefined' && typeof departToScenario === 'function'"
      + " && typeof regeneratePartyMembers === 'function' && typeof devPartySizeOverride === 'function'"
      + " && typeof selection !== 'undefined' && selection && Array.isArray(selection.partyComposition)",
      { timeout: 30000 });
    const kick = await page.evaluate(KICK_ONE, sid);
    /* index の着地待ち。⚠ 固定 sleep で誤魔化さない (sweep_recruit_balance と同じ待ち条件 +
       この節が読む allies / RUN が揃うまで)。 */
    let landed = '';
    try {
      await page.waitForFunction(
        "typeof mapData !== 'undefined' && typeof heroAI === 'function'"
        + " && typeof allies !== 'undefined' && typeof placeNodeParty === 'function'"
        + " && typeof buildNode === 'function' && typeof RUN !== 'undefined'",
        { timeout: 60000 });
      landed = page.url();
    } catch (e) {
      landed = 'TIMEOUT url=' + page.url();
    }
    return { page, kick, landed, tag };
  }

  let exitCode = 0;
  try {
    /* ══════════════════════════════════════════════════════════════════════
     * 観測 (判定より先に全部採る。母集団の行をログの先頭に出すため)
     * ══════════════════════════════════════════════════════════════════════ */
    const pageDefault = await openTavern('');                          /* 既定 = 本番と同じ URL */
    const obsDefault  = await pageDefault.evaluate(OBSERVE, SCENARIO_IDS);
    /* ⚠ location.href への代入は同期では飛ばない。evaluate が返った直後に navBlocked を読むと
         0 件になり (1e) が「横取りが空振り」という偽の赤を出す。ネットワーク層へ届くまで待つ。 */
    await sleep(900);

    const pageFixed   = await openTavern('?party=' + PROBE_N);         /* 対照群: シームが生きているか */
    const obsFixed    = await pageFixed.evaluate(OBSERVE, SCENARIO_IDS);

    const pageBad     = await openTavern('?party=abc');                /* 不正値 = 恒等 + [DIAG] */
    const cBadBefore  = pageBad.__console.length;
    const obsBad      = await pageBad.evaluate(OBSERVE, SCENARIO_IDS);
    await sleep(150);
    const diagBad     = pageBad.__console.slice(cBadBefore).filter((l) => /\[DIAG\] party override: ignored/.test(l));

    const pageOOR     = await openTavern('?party=9');                  /* 2〜8 の外 = 恒等 + [DIAG] */
    const cOorBefore  = pageOOR.__console.length;
    const obsOOR      = await pageOOR.evaluate(OBSERVE, SCENARIO_IDS);
    await sleep(150);
    const diagOOR     = pageOOR.__console.slice(cOorBefore).filter((l) => /\[DIAG\] party override: ignored/.test(l));

    const arms = [
      { key: '既定 (?party 無し)', obs: obsDefault },
      { key: '?party=' + PROBE_N,  obs: obsFixed },
      { key: '?party=abc',         obs: obsBad },
      { key: '?party=9',           obs: obsOOR },
    ];

    /* ══════════════════════════════════════════════════════════════════════
     * §3 受入条件 3. 母集団ガード — ⚠⚠⚠ 到達数を必ずログの先頭に出す
     *   到達 = departToScenario() が partyMembers へ**実体の配列**を書いた走行。
     *   「違反 0 件」は母集団が 0 でも 0 件になるので、件数を出さない集計は禁止。
     * ══════════════════════════════════════════════════════════════════════ */
    console.log('');
    console.log('====== 母集団ガード (受入条件 3.) ======');
    let reachedTotal = 0, expectTotal = 0;
    for (const a of arms) {
      const reached = a.obs.rows.filter((r) => r.wrote && r.isArray && r.total > 0);
      reachedTotal += reached.length; expectTotal += SCENARIO_IDS.length;
      console.log('  到達 ' + reached.length + '/' + SCENARIO_IDS.length + '  腕=' + a.key
        + '  出発人数=[' + a.obs.rows.map((r) => r.total).join(',') + ']');
      const miss = a.obs.rows.filter((r) => !(r.wrote && r.isArray && r.total > 0));
      if (miss.length) console.log('    NG 未到達: ' + miss.map((r) => r.id).join(' , '));
      if (a.obs.threw) console.log('    NG 例外: ' + a.obs.threw);
    }
    console.log('  合計 到達 ' + reachedTotal + '/' + expectTotal + ' 走行');
    console.log('');

    check('(3a) 4 腕 x 6 シナリオ = 24 走行すべてが departToScenario() で実体の配列を書いた',
      reachedTotal === expectTotal, '到達 ' + reachedTotal + '/' + expectTotal);
    check('(3b) 既定腕は 6 シナリオすべてで主人公がちょうど 1 人 (実体を読めている証明)',
      obsDefault.rows.length === SCENARIO_IDS.length && obsDefault.rows.every((r) => r.heroes === 1),
      'heroes=[' + obsDefault.rows.map((r) => r.heroes).join(',') + ']');
    check('(3c) 判定本体は空の観測で **落ちる** (母集団 0 件で緑にならない)',
      judgeIdentity([], EXPECTED_NPC).ok === false && judgeFixedTotal([], PROBE_N).ok === false);

    /* ══════════════════════════════════════════════════════════════════════
     * §1 装置 assert — シームが実在し、期待表が潰れていないか
     * ══════════════════════════════════════════════════════════════════════ */
    console.log('====== §1 装置 ======');
    const seam = obsDefault.seam;
    check('(1a) 本番の関数が裸の識別子で読める (scenarios / recruitCountOf / regenerate / depart)',
      seam.scenarios === 'object' && seam.recruitCountOf === 'function'
      && seam.regenerate === 'function' && seam.departToScenario === 'function',
      JSON.stringify({ scenarios: seam.scenarios, recruitCountOf: seam.recruitCountOf,
        regenerate: seam.regenerate, depart: seam.departToScenario }));
    check('(1b) 調査シーム devPartySizeOverride が実在する (function 宣言)',
      seam.devPartySizeOverride === 'function', 'typeof=' + seam.devPartySizeOverride);
    check('(1c) 期待表が 1 種類の値に潰れていない (一致が自明にならない)',
      new Set(Object.values(EXPECTED_NPC)).size >= 2,
      '値の種類=' + new Set(Object.values(EXPECTED_NPC)).size);
    check('(1d) ページの星の数が期待表と一致する (仕様を変えればここが赤くなる)',
      obsDefault.rows.every((r) => r.stars === EXPECTED_STARS[r.id]),
      obsDefault.rows.map((r) => r.id + ':' + r.stars).join(' '));
    /* ⚠ 「6 シナリオ踏んだから横取りも 6 件」ではない。departToScenario() の末尾は
         window.location.href = target で、1 回の同期 evaluate 内で 6 回代入しても
         **保留中の遷移は 1 本に畳まれる** (実測 1 件)。回数は手段であって不変条件ではない。
         守りたいのは「出発処理が遷移の行まで到達し、横取りで酒場に留まった」こと。
         6 件それぞれが出発処理を通ったことは (3a) の wrote/isArray が別途押さえている。
       ⚠ location.href への代入は同期では飛ばないので、読む前に必ず待つ
         (verify_recruit_size の (Az3) が同じ理由で 900ms 待っている)。 */
    check('(1e) departToScenario() が実際に index.html へ遷移しようとし、横取りで酒場に留まった',
      pageDefault.__navBlocked.length >= 1 && /\/tavern\.html/.test(pageDefault.url()),
      '横取り ' + pageDefault.__navBlocked.length + ' 件 / 現在地 = ' + pageDefault.url());
    check('(1f) 既定腕は募集 ON のまま (?recruit を触っていない)',
      seam.recruitOn === true, 'isRecruitOn()=' + seam.recruitOn + ' search=' + JSON.stringify(seam.search));

    /* ══════════════════════════════════════════════════════════════════════
     * §2 受入条件 1. — 既定が本番と 1 ビットも変わらない
     *   判定は judgeIdentity() ただ 1 本。--negative が同じ関数に同じ観測を通す。
     * ══════════════════════════════════════════════════════════════════════ */
    console.log('====== §2 受入条件 1. 既定が本番と 1 ビットも変わらない ======');
    const vDefault = judgeIdentity(obsDefault.rows, EXPECTED_NPC);
    console.log('  既定腕: ' + dump(obsDefault.rows));
    if (!NEGATIVE) {
      check('(2a) ?party 無指定で 6 シナリオの formation 人数が #7 と一致する',
        vDefault.ok, vDefault.diffs.length ? vDefault.diffs.join(' / ') : '差分なし');
    } else {
      console.log('  (2a) は §4 の負のコントロールで判定する (同じ judgeIdentity を ok===false で要求)');
    }
    check('(2b) 経路 B (recruitCountOf の戻り値) とも一致する — 2 経路の突き合わせ',
      obsDefault.rows.every((r) => r.decided === EXPECTED_NPC[r.id]),
      obsDefault.rows.map((r) => r.id + ':' + r.decided).join(' '));

    /* 対照群 (装置): シームが死んでいたら「既定が恒等」は自明に緑になる。
       「無いこと」の assert には必ず対照群を置く。 */
    const vFixed = judgeFixedTotal(obsFixed.rows, PROBE_N);
    console.log('  ?party=' + PROBE_N + ' 腕: ' + dump(obsFixed.rows));
    check('(2z1) 対照群: ?party=' + PROBE_N + ' で 6 シナリオとも計 ' + PROBE_N + ' 人 (シームは生きている)',
      vFixed.ok, vFixed.bad.length ? vFixed.bad.join(' / ') : '全件一致');
    check('(2z2) 既定腕と ?party=' + PROBE_N + ' 腕は実際に別物 (腕が割れている)',
      obsDefault.rows.some((r, i) => r.total !== obsFixed.rows[i].total),
      '既定=[' + obsDefault.rows.map((r) => r.total).join(',') + '] / 指定=['
        + obsFixed.rows.map((r) => r.total).join(',') + ']');
    check('(2z3) 不正値 (?party=abc) は恒等に戻り、silent fail-open にならない ([DIAG] が出る)',
      judgeIdentity(obsBad.rows, EXPECTED_NPC).ok && diagBad.length > 0,
      '[DIAG] ' + diagBad.length + ' 行 / 例: ' + (diagBad[0] || '(なし)'));
    check('(2z4) 範囲外 (?party=9) は恒等に戻り、[DIAG] が出る',
      judgeIdentity(obsOOR.rows, EXPECTED_NPC).ok && diagOOR.length > 0,
      '[DIAG] ' + diagOOR.length + ' 行 / 例: ' + (diagOOR[0] || '(なし)'));
    check('(2z5) ページエラーが 0 件',
      pageErrors.length === 0, pageErrors.slice(0, 3).join(' | ') || 'なし');

    /* ══════════════════════════════════════════════════════════════════════
     * §4 受入条件 2. — 負のコントロールを道具に内蔵
     *   --negative では **同じ judgeIdentity** が ok===false になることを要求する。
     *   ⚠ 母集団に届いていない赤は「別の理由の赤」なので成功に数えない。
     * ══════════════════════════════════════════════════════════════════════ */
    console.log('====== §4 受入条件 2. 負のコントロール ======');
    if (!NEGATIVE) {
      console.log('  (--negative を付けたときだけ判定する。ここでは変異が配信できることだけ確かめる)');
      check('(4z0) 変異アンカーが tavern.html にちょうど 1 箇所ある',
        anchorHits === 1, 'hits=' + anchorHits);
    } else {
      const servedTav = await httpGet('http://localhost:' + PORT + '/tavern.html');
      const mutServed = servedTav.indexOf(MUT_TO) >= 0 && servedTav.indexOf(MUT_FROM) < 0;
      const reachedDefault = obsDefault.rows.filter((r) => r.wrote && r.isArray && r.total > 0).length;
      console.log('  変異が配信に載った: ' + mutServed);
      console.log('  既定腕の到達: ' + reachedDefault + '/' + SCENARIO_IDS.length);
      console.log('  judgeIdentity(既定腕) = ' + (vDefault.ok ? '緑' : '赤')
        + (vDefault.diffs.length ? ' -- ' + vDefault.diffs.join(' / ') : ''));
      check('(4a) 変異が実際に配信された (ディスクは無傷のまま)', mutServed,
        'MUT_TO=' + (servedTav.indexOf(MUT_TO) >= 0) + ' MUT_FROM残=' + (servedTav.indexOf(MUT_FROM) >= 0));
      check('(4b) 母集団に到達している (赤の理由が「測れていない」ではない)',
        reachedDefault === SCENARIO_IDS.length, reachedDefault + '/' + SCENARIO_IDS.length);
      check('(4c) 受入条件 1. の判定本体 (judgeIdentity) が **赤くなった**',
        vDefault.ok === false, vDefault.diffs.join(' / ') || '(緑のまま = assert が空回りしている)');
      check('(4d) ?party 指定の枝は変異の影響を受けない (変異が恒等の枝だけを狙えている)',
        vFixed.ok, vFixed.bad.join(' / ') || '計' + PROBE_N + '人のまま');
    }

    /* ══════════════════════════════════════════════════════════════════════
     * §5〜§7 (STEP2) — 静的・幾何の測定 (受入条件 4. / 5. / 6.)
     * ──────────────────────────────────────────────────────────────────────
     * ⚠ --negative では走らせない。変異 (MUT_FROM → MUT_TO) が書き換えるのは
     *   devPartySizeOverride の「raw === null」枝 = **?party 無指定のときだけ通る枝**で、
     *   これらの節は必ず ?party=N を渡すので**原理的に届かない**。
     *   その「届かない」こと自体は (4d) が同じ観測で機械的に判定している。
     *   ⭐ 届かない節を負のコントロールに混ぜると、走行時間だけ倍になって信号が 1 ビットも
     *     増えない (しかも「赤くならなかった」の理由が 2 種類に増えて読めなくなる)。
     * ══════════════════════════════════════════════════════════════════════ */
    if (NEGATIVE) {
      console.log('====== §5〜§7 受入条件 4. / 5. / 6. ======');
      console.log('  -- --negative では走らせない。変異は devPartySizeOverride の');
      console.log('     「raw === null」枝 (= ?party 無指定) だけを書き換えるので、');
      console.log('     ?party=N を必ず渡すこれらの節には原理的に届かない。');
      console.log('     その「届かない」こと自体は (4d) が同じ観測で機械的に判定している。 --');
    } else {
      const tStep2 = Date.now();

      /* ── 腕の起動 (N=5 / N=6 x 6 シナリオ)。⚠ この節で唯一の重い処理 ── */
      const spawnArms = [];
      for (const n of [PROBE_N, PROBE_N6]) {
        for (const sid of SCENARIO_IDS) {
          const arm = await openIndexArm(sid, n, { width: 1280, height: 900 });
          let sweep = { err: '着地せず: ' + arm.landed, rows: [], initial: null,
                        allies: -1, nodeCount: 0, zones: '', classKeys: '', startMatch: null };
          if (/\/index\.html/.test(arm.landed)) sweep = await arm.page.evaluate(SWEEP_SPAWN);
          spawnArms.push({ scen: sid, n, landed: arm.landed, kick: arm.kick, sweep });
          try { await arm.page.close(); } catch (e) {}
        }
      }
      /* 1 配置 = 1 行へ畳む (起動時配置 ① + ノード遷移配置 ②) */
      const spawnRows = [];
      for (const a of spawnArms) {
        const rs = [];
        if (a.sweep.initial) rs.push(a.sweep.initial);
        for (const r of (a.sweep.rows || [])) rs.push(r);
        for (const r of rs) spawnRows.push(Object.assign({ scen: a.scen, n: a.n }, r));
      }

      /* ══ §5 受入条件 4. スポーンタイル ══════════════════════════════════
       * ⚠⚠⚠ 母集団ガード: 「違反 0 件」は母集団が 0 でも 0 件になる。
       *   何シナリオ / 何ノード / 何配置を実際に測ったかを**必ず先頭に出す**。 */
      console.log('====== §5 受入条件 4. スポーンタイル ======');
      console.log('  母集団: 腕 ' + spawnArms.length + ' 本 (N=' + PROBE_N + ' / N=' + PROBE_N6
        + ' x ' + SCENARIO_IDS.length + ' シナリオ)');
      for (const a of spawnArms) {
        console.log('    ' + a.scen + ' N=' + a.n
          + ': 着地=' + (/\/index\.html/.test(a.landed) ? 'index.html' : a.landed)
          + ' / 仲間=' + a.sweep.allies + '人'
          + ' / ノード=' + a.sweep.nodeCount + '件'
          + ' / 配置測定=' + ((a.sweep.rows || []).length + (a.sweep.initial ? 1 : 0)) + '件'
          + (a.sweep.err ? '  NG ' + a.sweep.err : ''));
      }
      const allyPlacements = spawnRows.reduce((s, r) => s + (r.tiles || []).length, 0);
      console.log('  合計 配置 ' + spawnRows.length + ' 件 / 仲間の着地 ' + allyPlacements + ' 人ぶん');

      /* 実装の候補数を実装から読む (⭐ 依頼書の前提表は起動時配置の代替候補しか見ていない) */
      const idxSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
      const countPairs = (s) => (s ? (s.match(/\[\s*-?\d+\s*,\s*-?\d+\s*\]/g) || []).length : -1);
      const mFall = idxSrc.match(/const ALLY_FALLBACK_OFFSETS = \[([\s\S]*?)\];/);
      const mRing = idxSrc.match(/const RING = \[([\s\S]*?)\];/);
      const nFall = countPairs(mFall && mFall[1]);
      const nRing = countPairs(mRing && mRing[1]);
      console.log('  実装の候補数: 起動時 resolveAllyInitTile = 希望1 + 代替 ' + nFall
        + ' 個 / ノード遷移 placeNodeParty = RING ' + nRing + ' 個');

      const vSpawn      = judgeSpawn(spawnRows);
      const overlapRows = spawnRows.filter((r) => r.overlap > 0);
      const wallRows    = spawnRows.filter((r) => (r.walls || []).some(Boolean));
      /* ⭐ (c) が 1 人でも出たノードは座標を全部ログに残す (そのノードが上限の真の制約) */
      if (overlapRows.length) {
        console.log('  ★ (c) 頭に重ねる枝に落ちた配置 ' + overlapRows.length + ' 件 — 座標を全部残す:');
        overlapRows.forEach((r) => console.log('     ' + r.scen + ' N=' + r.n + ' node=' + r.node
          + '(' + r.kind + ') via=' + r.via + ' head=' + JSON.stringify(r.head)
          + ' 仲間=' + JSON.stringify(r.tiles)));
      } else {
        console.log('  ★ (c) 頭に重ねる枝に落ちた仲間: 0 人 / 全 ' + spawnRows.length + ' 配置 ('
          + allyPlacements + ' 人ぶん)');
      }
      if (wallRows.length) {
        console.log('  ★ (b) 壁の中に湧いた配置 ' + wallRows.length + ' 件:');
        wallRows.forEach((r) => console.log('     ' + r.scen + ' N=' + r.n + ' node=' + r.node
          + ' via=' + r.via + ' 仲間=' + JSON.stringify(r.tiles) + ' walls=' + JSON.stringify(r.walls)));
      }

      check('(5a) 12 腕すべてが index.html へ着地し、指定どおり N 人で出発した',
        spawnArms.length === 2 * SCENARIO_IDS.length
        && spawnArms.every((a) => /\/index\.html/.test(a.landed)
          && a.kick.total === a.n && a.sweep.allies === a.n - 1),
        spawnArms.map((a) => a.scen + '/N=' + a.n + ':計' + a.kick.total + '人/仲間' + a.sweep.allies).join(' '));
      check('(5b) 6 シナリオ x 全ノード x 全入口方向で (a) 別タイル (b) 壁でない (c) 頭重ね 0 人',
        vSpawn.ok, vSpawn.bad.length ? vSpawn.bad.slice(0, 6).join(' / ') : '違反なし ('
          + spawnRows.length + ' 配置 / ' + allyPlacements + ' 人ぶん)');
      check('(5c) 頭 (playerX/Y) 自身も壁の中に立っていない',
        spawnRows.length > 0 && spawnRows.every((r) => r.headWall === false),
        '壁の中の頭 ' + spawnRows.filter((r) => r.headWall !== false).length + ' 件');
      check('(5z1) 判定本体は空の観測で落ちる (母集団 0 件で緑にならない)',
        judgeSpawn([]).ok === false);
      check('(5z2) 判定本体は (a)(b)(c) を実際に赤にし、正常な観測は緑にする',
        [{ scen: 'x', n: 3, node: 'n0', via: 'up', head: [0, 0], headWall: false,
           tiles: [[1, 1], [1, 1]], walls: [false, false], overlap: 0 },
         { scen: 'x', n: 3, node: 'n0', via: 'up', head: [0, 0], headWall: false,
           tiles: [[1, 1], [2, 2]], walls: [true, false], overlap: 0 },
         { scen: 'x', n: 3, node: 'n0', via: 'up', head: [0, 0], headWall: false,
           tiles: [[0, 0], [2, 2]], walls: [false, false], overlap: 1 }]
          .every((r) => judgeSpawn([r]).ok === false)
        && judgeSpawn([{ scen: 'x', n: 3, node: 'n0', via: 'up', head: [0, 0], headWall: false,
             tiles: [[1, 1], [2, 2]], walls: [false, false], overlap: 0 }]).ok === true);
      check('(5z3) 起動時配置の再実行は起動時と同じ盤面で行われた (PARTY_START_* === START_*)',
        spawnArms.length > 0 && spawnArms.every((a) => a.sweep.startMatch === true),
        spawnArms.map((a) => a.scen + '/N=' + a.n + ':' + a.sweep.startMatch).join(' '));
      check('(5z4) 母集団: どの腕でも「起動時配置 1 件 + ノード遷移配置 2 件以上」を実際に踏んだ',
        spawnArms.length > 0 && spawnArms.every((a) => a.sweep.initial && (a.sweep.rows || []).length >= 2),
        spawnArms.map((a) => a.scen + '/N=' + a.n + ':' + ((a.sweep.rows || []).length)).join(' '));
      check('(5z5) 配置関数 2 本の候補数を実装から読めた (前提表が見ていない側が在ることの証明)',
        nFall > 0 && nRing > 0, '起動時の代替=' + nFall + '個 / ノード遷移の RING=' + nRing + '個');

      /* ══ §6 受入条件 5. 隊列順と zone ═══════════════════════════════════ */
      console.log('====== §6 受入条件 5. 隊列順と zone ======');
      const pageN6 = await openTavern('?party=' + PROBE_N6);
      const obsN6  = await pageN6.evaluate(OBSERVE, SCENARIO_IDS);
      await sleep(900);
      const formTav5 = obsFixed.rows.map((r) => ({ id: 'tavern/' + r.id, zones: r.zones }));
      const formTav6 = obsN6.rows.map((r) => ({ id: 'tavern/' + r.id, zones: r.zones }));
      const formIdx5 = spawnArms.filter((a) => a.n === PROBE_N)
        .map((a) => ({ id: 'index/' + a.scen, zones: a.sweep.zones }));
      const formIdx6 = spawnArms.filter((a) => a.n === PROBE_N6)
        .map((a) => ({ id: 'index/' + a.scen, zones: a.sweep.zones }));
      console.log('  母集団: 酒場の出力 N=' + PROBE_N + ' が ' + formTav5.length + ' 件 / N=' + PROBE_N6
        + ' が ' + formTav6.length + ' 件、index が実際に読んだ formation N=' + PROBE_N + ' が '
        + formIdx5.length + ' 件 / N=' + PROBE_N6 + ' が ' + formIdx6.length + ' 件');
      [['酒場 N=' + PROBE_N, formTav5], ['酒場 N=' + PROBE_N6, formTav6],
       ['index N=' + PROBE_N, formIdx5], ['index N=' + PROBE_N6, formIdx6]].forEach(([lbl, rs]) => {
        console.log('    ' + lbl + ': ' + rs.map((r) => r.id.split('/')[1] + '=' + r.zones).join('  '));
      });
      const vF5t = judgeFormation(formTav5, PROBE_N);
      const vF6t = judgeFormation(formTav6, PROBE_N6);
      const vF5i = judgeFormation(formIdx5, PROBE_N);
      const vF6i = judgeFormation(formIdx6, PROBE_N6);
      check('(6a) N=' + PROBE_N + ' の隊列が front->mid->rear / [0]=front / zone 欠落なし (酒場の出力)',
        vF5t.ok, vF5t.bad.join(' / ') || '6 シナリオとも成立');
      check('(6b) N=' + PROBE_N6 + ' の隊列が front->mid->rear / [0]=front / zone 欠落なし (酒場の出力)',
        vF6t.ok, vF6t.bad.join(' / ') || '6 シナリオとも成立');
      check('(6c) N=' + PROBE_N + ' の隊列 — index が実際に読んだ formation でも成立 (2 経路目)',
        vF5i.ok, vF5i.bad.join(' / ') || '6 シナリオとも成立');
      check('(6d) N=' + PROBE_N6 + ' の隊列 — index が実際に読んだ formation でも成立 (2 経路目)',
        vF6i.ok, vF6i.bad.join(' / ') || '6 シナリオとも成立');
      check('(6z1) 判定本体は空の観測で落ちる', judgeFormation([], PROBE_N).ok === false);
      check('(6z2) 判定本体は順序崩れ / zone 欠落 / [0] 非 front を実際に赤にする',
        judgeFormation([{ id: 'x', zones: 'front>rear>mid' }], 3).ok === false
        && judgeFormation([{ id: 'x', zones: 'front>front>mid' }], 3).ok === false
        && judgeFormation([{ id: 'x', zones: 'mid>mid>rear' }], 3).ok === false
        && judgeFormation([{ id: 'x', zones: 'front>mid>rear' }], 3).ok === true);

      /* ══ §7 受入条件 6. 下部 HP ミニバーの枠 ════════════════════════════ */
      console.log('====== §7 受入条件 6. 下部 HP ミニバーの枠 ======');
      const MINIBAR_SCEN = SCENARIO_IDS[0];
      const barRows = [];
      for (const n of MINIBAR_NS) {
        const arm = await openIndexArm(MINIBAR_SCEN, n, MINIBAR_VIEW);
        let m = { err: '着地せず: ' + arm.landed, chips: [], innerW: -1, collapsed: false,
                  clientW: -1, scrollW: -1, gapPx: -1 };
        if (/\/index\.html/.test(arm.landed)) {
          /* ⚠ 固定 sleep で誤魔化さない。ミニバーは renderPartyStatuses から描かれるので
             チップが 1 枚でも出るまでポーリングする。 */
          try {
            await arm.page.waitForFunction(
              "(document.getElementById('hpMiniBar') || {}).childElementCount > 0", { timeout: 20000 });
          } catch (e) { /* 出なければ下の judgeMiniBar が枚数違いで赤くする */ }
          m = await arm.page.evaluate(MEASURE_MINIBAR);
        }
        barRows.push(Object.assign({ n, scen: MINIBAR_SCEN }, m));
        try { await arm.page.close(); } catch (e) {}
      }
      console.log('  母集団: ' + barRows.length + ' 腕 (N=' + MINIBAR_NS.join(' / ') + ') / 画面 '
        + MINIBAR_VIEW.width + 'x' + MINIBAR_VIEW.height + ' / シナリオ=' + MINIBAR_SCEN);
      barRows.forEach((r) => {
        const rt = retreatChipOf(r);
        const pred = partyChipPredicted(r);
        console.log('    N=' + r.n + ': チップ ' + (r.chips || []).length + ' 枚'
          + ' / 頭+仲間 = [' + partyChipsOf(r).map((c) => c.w).join(', ') + ']px'
          + ' / 撤退 = ' + (rt ? rt.w + 'px (min-width ' + rt.minW + ')' : '(なし)')
          + ' / bar client=' + r.clientW + ' scroll=' + r.scrollW
          + ' gap=' + r.gapPx + ' padding=' + r.padL + '+' + r.padR
          + ' / 横スクロール=' + (r.err ? '(測れず)' : (overflowed(r) ? '★あり' : 'なし'))
          + ' / 実測からの導出値=' + (pred === null ? '-' : pred.toFixed(2)) + 'px'
          + (r.err ? '  NG ' + r.err : ''));
      });
      const barOK   = barRows.filter((r) => !r.err && (r.chips || []).length === r.n + 1);
      const barFit  = barOK.filter((r) => !overflowed(r)).map((r) => r.n);
      const barOver = barOK.filter((r) =>  overflowed(r)).map((r) => r.n);
      const barLimit = barFit.length ? Math.max.apply(null, barFit) : null;
      console.log('  ⭐ 横スクロールに落ちない N の上限 = '
        + (barLimit === null ? '(測定範囲内に無い)' : barLimit + ' 人')
        + '   溢れない N=[' + barFit.join(',') + '] / 溢れる N=[' + barOver.join(',') + ']');
      /* ⚠ 予測との突き合わせは **ログだけ**。assert には一切使わない (実測が正)。 */
      const rtW = (retreatChipOf(barOK[0] || {}) || {}).w;
      console.log('  ⚠ 依頼書 受入条件 6. の予測 (4人 70.8 / 5人 58.0 / 6人 48.9px) は、撤退チップが');
      console.log('     .hpChip.retreatChip { flex: 0 0 auto; min-width: 48px } = 伸縮しない固定枠で');
      console.log('     あることを見落としている。⭐ さらに撤退チップの実寸は min-width の 48px ではなく');
      console.log('     **中身 (🏃 撤退) の幅 ' + (rtW === undefined ? '(未測定)' : rtW + 'px')
        + '** だった (flex:0 0 auto = auto basis なので内容幅で決まり、');
      console.log('     min-width はその下限でしかない)。上の実測が正。');
      const vBar = judgeMiniBar(barRows);
      const predOK = barOK.filter((r) => !overflowed(r)).every((r) => {
        const pred = partyChipPredicted(r);
        return pred !== null && partyChipsOf(r).every((c) => Math.abs(c.w - pred) <= 0.75);
      });
      const clampOK = barOK.filter((r) => overflowed(r)).every(
        (r) => partyChipsOf(r).every((c) => Math.abs(c.w - c.minW) <= 0.5));
      check('(7a) 390x844 の compact で N=' + MINIBAR_NS.join('/') + ' のミニバーを実測できた',
        vBar.ok, vBar.bad.join(' / ') || barRows.length + ' 腕とも観測成立');
      check('(7b) 上限が測定範囲の内側にある (溢れる N と溢れない N が両方在る = 上限を実際に跨いだ)',
        barFit.length > 0 && barOver.length > 0,
        '溢れない=[' + barFit.join(',') + '] / 溢れる=[' + barOver.join(',') + ']');
      check('(7c) 単調: 溢れない N はすべて溢れる N より小さい',
        barFit.length > 0 && barOver.length > 0
        && barFit.every((f) => barOver.every((o) => f < o)),
        '上限=' + barLimit);
      check('(7d) 溢れない N では「撤退枠を引いてから残りを等分」の導出と実測が 0.75px 以内で一致',
        barOK.filter((r) => !overflowed(r)).length > 0 && predOK,
        barOK.filter((r) => !overflowed(r)).map((r) => 'N=' + r.n + ':実測'
          + (partyChipsOf(r)[0] || {}).w + '/導出' + (partyChipPredicted(r) || 0).toFixed(2)).join(' '));
      check('(7e) 溢れる N では仲間チップが CSS の min-width に張り付いている (それ以上縮まない)',
        barOK.filter((r) => overflowed(r)).length > 0 && clampOK,
        barOK.filter((r) => overflowed(r)).map((r) => 'N=' + r.n + ':'
          + partyChipsOf(r).map((c) => c.w + '/' + c.minW).join(',')).join(' '));
      check('(7z1) 判定本体は空の観測で落ちる', judgeMiniBar([]).ok === false);
      check('(7z2) 判定本体はチップ枚数の食い違い / 非表示を実際に赤にする',
        judgeMiniBar([{ n: 5, innerW: MINIBAR_VIEW.width, collapsed: true,
          chips: [{ retreat: false, w: 60 }, { retreat: true, w: 48 }] }]).ok === false
        && judgeMiniBar([{ n: 1, innerW: MINIBAR_VIEW.width, collapsed: false,
          chips: [{ retreat: false, w: 60 }, { retreat: true, w: 48 }] }]).ok === false
        && judgeMiniBar([{ n: 1, innerW: MINIBAR_VIEW.width, collapsed: true,
          chips: [{ retreat: false, w: 60 }, { retreat: true, w: 48 }] }]).ok === true);

      console.log('  (§5〜§7 の所要 ' + Math.round((Date.now() - tStep2) / 1000) + ' 秒)');
    }

    /* ══════════════════════════════════════════════════════════════════════
     * ここから下は後続 STEP の担当。見出しだけ置いて中身は譲る。
     * ⚠ 空セクションは results に 1 件も積まない (未実装が緑に数えられないように)。
     * ══════════════════════════════════════════════════════════════════════ */
    const todo = (title, owner) => {
      console.log('====== ' + title + ' ======');
      console.log('  -- 未実装 (' + owner + ' の担当) --');
    };
    todo('§8 受入条件 7. カメラ / 主人公が画面外のフレーム率 (N=4 と N=5 のペア比較)', 'STEP3');
    todo('§9 受入条件 8. カメラ / クランプ区間が空に落ちた率 (loCx<=hiCx が偽になった回数)', 'STEP3');
    todo('§10 受入条件 9. 置き去りと救済 (MAX_LAG 超の待ち / ワープ救済の発動回数)', 'STEP3');
    todo('§11 受入条件 10. 描画コスト (performance.now の 1 フレーム実測)', 'STEP3');
    todo('§12 受入条件 11. 既存 golden の非退行', 'STEP4');
    todo('§13 受入条件 12. 依頼書へ「実装結果」節', 'STEP4');

  } catch (e) {
    console.error('[probe] FATAL ' + ((e && e.stack) || e));
    exitCode = 3;
  } finally {
    try { await browser.close(); } catch (e) {}
    try { srv.close(); } catch (e) {}
  }

  const pass = results.filter((r) => r.ok).length;
  console.log('');
  console.log('== 結果: ' + pass + '/' + results.length + (pass === results.length ? ' PASS ==' : ' FAIL =='));
  if (pass !== results.length) {
    results.filter((r) => !r.ok).forEach((r) => console.log('  FAILED: ' + r.name + '  -- ' + r.detail));
  }
  if (exitCode === 3) process.exit(3);
  if (NEGATIVE) {
    /* 負のコントロールは「赤くなること」が成功。判定は道具が自分で下す (人間の目視に委ねない)。 */
    const ok = results.every((r) => r.ok);
    console.log(ok
      ? '[negative] OK シームを恒等でなくすと受入条件 1. の判定が赤くなった (assert は空回りしていない)'
      : '[negative] NG 赤くならなかった / 母集団に届かなかった = assert が測定装置を守れていない');
    process.exit(ok ? 0 : 1);
  }
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(3); });
