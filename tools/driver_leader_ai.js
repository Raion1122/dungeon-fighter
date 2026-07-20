#!/usr/bin/env node
/*
 * driver_leader_ai.js — 「英雄の眼」フェーズ4 (案③骨格) 検証ドライバ
 *
 *   node tools/driver_leader_ai.js [--headful] [--browser <path>] [--port N]
 *
 * 対象は index.html 単独。フェーズ4 のスコープは **抽選のみ** (理由1行はフェーズ5)。
 *   G1  骨格の実在: pickLeaderAction / isBossLikeDef / encounterRound ミラー
 *   G2  RNG パリティ: pick 抽選が Math.random をちょうど 1 回だけ消費する
 *   G3  開幕バフ偏重が無い: 敵が新品 (hp===maxHp) でも攻撃の重みが 0 に潰れない
 *   G4  僧侶の回復頻度が現行 (一様ランダム) より落ちない
 *   G5  非有限の重みが warn 0 件 (壊れた入力でも id を返す)
 *   G6  実戦自走: ラウンドが進み、ミラーが同期し、warn が出ない
 *
 * ⚠️ 本ドライバの肝は **同一 run に内包した負のコントロール**。
 *    「baseline が PASS する」では空振りを検出できない (過去に 3 回踏んだ) ので、
 *    却下された素朴実装 (期待値 × (1-HP比) / T=0 / `total <= 0` ガード) をページ内に再現し、
 *    それが **確実に壊れること** を *正の assert* として測る (N1/N2/N3)。
 *
 * ⚠️ pickLeaderAction / isBossLikeDef は classic script 直下の function で window に自動で
 *    載らないため、実装側が明示公開したシーム (window.pickLeaderAction 等) を使う。
 *    encounterRound は let なので **bare 名で読む** (window.encounterRound は undefined)。
 */
const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg  = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const PORT    = parseInt(arg('port', '8831'), 10);

function loadPuppeteer() {
  const tried = [];
  try { return require('puppeteer-core'); } catch (e) { tried.push('puppeteer-core'); }
  const scratch = path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core');
  try { return require(scratch); } catch (e) { tried.push(scratch); }
  console.error('[driver] puppeteer-core が見つかりません。試行: ' + tried.join(' / '));
  process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  const cands = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  console.error('[driver] Chrome/Edge が見つかりません。--browser <path> で指定してください。');
  process.exit(2);
}
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const fp = path.join(ROOT, u);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.statusCode = 404; res.end('404'); return; }
        res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        fs.createReadStream(fp).pipe(res);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    srv.on('error', reject);
    srv.listen(PORT, () => resolve(srv));
  });
}

const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: detail || '' });
  console.log((cond ? '  OK  ' : '  NG  ') + name + (detail ? '  — ' + detail : ''));
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const allPageErrors = [];

async function freshPage(browser, qs) {
  const page = await browser.newPage();
  page.on('pageerror', e => allPageErrors.push(e.message));
  await page.evaluateOnNewDocument(() => {
    sessionStorage.setItem('dragonfighters.currentScenario', 'goblin-mine');
  });
  await page.goto('http://localhost:' + PORT + '/index.html?' + (qs || 'autoplay=30&diag=1'),
    { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    'typeof gameStarted !== "undefined" && gameStarted && document.getElementById("combatLog")',
    { timeout: 45000 });
  await sleep(400);
  return page;
}

// 戦闘の自走が測定を汚さないよう敵を遠ざけて静穏化する (driver_cleanup_phase1 の QUIET を踏襲)。
const QUIET = `
  try { enemies.forEach(e => { e.x = -999999; e.y = -999999; }); } catch (e) {}
  try { encounterActive = false; } catch (e) {}
`;

// ページ内に置く共通ヘルパ: 疑似ターゲットの生成と N 回サンプリング
const HELPERS = `
  window.__mkTarget = function (opt) {
    opt = opt || {};
    return {
      hp: (opt.hp != null ? opt.hp : 30),
      maxHp: (opt.maxHp != null ? opt.maxHp : 30),
      alive: true,
      def: opt.def || { name: 'ダミー', hp: (opt.maxHp != null ? opt.maxHp : 30) },
    };
  };
  window.__sample = function (choices, ctx, n) {
    const tally = {};
    for (const c of choices) tally[c] = 0;
    for (let i = 0; i < n; i++) tally[window.pickLeaderAction(choices, ctx).id]++;
    return tally;
  };
  // フェーズ5: id だけでなく why も集計する。byId[id] = {n:選ばれた回数, whyN:非nullなwhyの回数, sample:最初のwhy}。
  // normalWhy = id==='normal' なのに why が付いた回数 (0 でなければならない)。malformed = 形式違反の非null why。
  window.__sampleWhy = function (choices, ctx, n) {
    const byId = {};
    for (const c of choices) byId[c] = { n: 0, whyN: 0, sample: null };
    let normalWhy = 0, malformed = 0;
    const re = /^◇ .+ ── .+$/;
    for (let i = 0; i < n; i++) {
      const r = window.pickLeaderAction(choices, ctx);
      const b = byId[r.id] || (byId[r.id] = { n: 0, whyN: 0, sample: null });
      b.n++;
      if (r.why != null) {
        b.whyN++;
        if (b.sample == null) b.sample = r.why;
        if (r.id === 'normal') normalWhy++;
        if (!re.test(r.why)) malformed++;
      }
    }
    return { byId, normalWhy, malformed };
  };
`;

(async () => {
  const puppeteer   = loadPuppeteer();
  const browserPath = findBrowser();
  const srv = await startServer();
  console.log('[driver] serving ' + ROOT + ' @ http://localhost:' + PORT);

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'df_leaderai_'));
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--user-data-dir=' + profile],
  });

  // ══════════════════════════════════════════════════════════════════
  console.log('\n--- (G1) 骨格の実在と型 ---');
  {
    const page = await freshPage(browser);
    await page.evaluate(QUIET);
    await page.evaluate(HELPERS);

    const shape = await page.evaluate(() => {
      const r = window.pickLeaderAction(['normal'], { target: window.__mkTarget({}) });
      return {
        hasPick: typeof window.pickLeaderAction === 'function',
        hasBoss: typeof window.isBossLikeDef === 'function',
        // ⚠ encounterRound は let なので bare 名で読む (window 経由だと両側 undefined で PASS する)
        roundBare: (typeof encounterRound !== 'undefined') ? encounterRound : '(undefined)',
        roundOnWindow: window.encounterRound,
        ret: r,
        retKeys: Object.keys(r).sort().join(','),
      };
    });
    check('(G1.1) window.pickLeaderAction が関数として公開されている', shape.hasPick);
    check('(G1.2) window.isBossLikeDef が関数として公開されている', shape.hasBoss);
    check('(G1.3) 返り値が {id, why} 型 (normal 単独では why は null = 通常攻撃は無言)',
      shape.retKeys === 'id,why' && shape.ret.id === 'normal' && shape.ret.why === null,
      JSON.stringify(shape.ret));
    check('(G1.4) encounterRound は bare 名で読め、window には載っていない',
      typeof shape.roundBare === 'number' && shape.roundOnWindow === undefined,
      'bare=' + shape.roundBare + ' window=' + shape.roundOnWindow);

    // isBossLikeDef の真理値表 (3 条件 OR + 非ボス)
    const boss = await page.evaluate(() => ({
      byFlag:    window.isBossLikeDef({ isBoss: true }),
      byEyes:    window.isBossLikeDef({ eyeStalks: ['magicMissileEye'] }),
      bySummons: window.isBossLikeDef({ maxSummons: 3 }),
      zeroSum:   window.isBossLikeDef({ maxSummons: 0 }),
      plain:     window.isBossLikeDef({ name: '雑魚' }),
      nullish:   window.isBossLikeDef(null),
    }));
    check('(G1.5) isBossLikeDef: isBoss / eyeStalks / maxSummons>0 の 3 条件で true',
      boss.byFlag && boss.byEyes && boss.bySummons, JSON.stringify(boss));
    check('(G1.6) isBossLikeDef: maxSummons===0 / 素の雑魚 / null は false',
      boss.zeroSum === false && boss.plain === false && boss.nullish === false, JSON.stringify(boss));

    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════
  console.log('\n--- (G2) RNG パリティ: 抽選は Math.random ちょうど 1 回 ---');
  {
    const page = await freshPage(browser);
    await page.evaluate(QUIET);
    await page.evaluate(HELPERS);

    const rng = await page.evaluate(() => {
      const real = Math.random;
      let n = 0;
      Math.random = function () { n++; return real.apply(this, arguments); };
      const out = {};
      const t = window.__mkTarget({ hp: 20, maxHp: 30 });
      for (const cs of [['normal'], ['normal', 'strong-cleave'], ['normal', 'strong-cleave', 'morale', 'iron-guard']]) {
        n = 0;
        window.pickLeaderAction(cs, { target: t });
        out['n' + cs.length] = n;
      }
      // 旧実装 (一様ランダム) の消費回数 = 比較の基準
      n = 0;
      const legacy = ['normal', 'strong-cleave', 'morale'];
      legacy[Math.floor(Math.random() * legacy.length)];
      out.legacy = n;
      Math.random = real;
      return out;
    });
    check('(G2.1) 候補 1 個でも Math.random は 1 回', rng.n1 === 1, 'n=' + rng.n1);
    check('(G2.2) 候補 2 個でも Math.random は 1 回', rng.n2 === 1, 'n=' + rng.n2);
    check('(G2.3) 候補 4 個でも Math.random は 1 回', rng.n4 === 1, 'n=' + rng.n4);
    check('(G2.4) 旧実装 (一様ランダム) の消費回数と厳密一致',
      rng.legacy === 1 && rng.n1 === rng.legacy && rng.n2 === rng.legacy && rng.n4 === rng.legacy,
      JSON.stringify(rng));

    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════
  console.log('\n--- (G3) 開幕 (敵が新品 hp===maxHp) でも攻撃が潰れない ---');
  {
    const page = await freshPage(browser);
    await page.evaluate(QUIET);
    await page.evaluate(HELPERS);

    const N = 4000;
    const open = await page.evaluate((N) => {
      leaderClassKey = 'warrior';
      encounterRound = 1;
      hp = maxHp;   // 回復候補が混ざらない状態に固定
      const fresh = window.__mkTarget({ hp: 40, maxHp: 40 });   // ⚠ 敵生成と同じ hp===maxHp
      const cs = ['normal', 'strong-cleave', 'morale'];
      const t = window.__sample(cs, { target: fresh }, N);
      return { tally: t, atk: (t['normal'] + t['strong-cleave']) / N, buff: t['morale'] / N };
    }, N);
    check('(G3.1) 開幕でも攻撃候補が 1 回も選ばれない、が起きていない',
      open.tally['normal'] > 0 && open.tally['strong-cleave'] > 0, JSON.stringify(open.tally));
    check('(G3.2) 開幕の攻撃シェアが過半 (バフ偏重に退行していない)',
      open.atk > 0.5, 'atk=' + open.atk.toFixed(3) + ' buff=' + open.buff.toFixed(3));
    check('(G3.3) 開幕のバフシェアが一様ランダム (1/3) を大きくは超えない (加点は控えめ)',
      open.buff < 0.45, 'buff=' + open.buff.toFixed(3));

    // 瀕死の敵は健康な敵より狙われる (HP 帯 + 撃破判定が順位を動かしている証拠)
    const rank = await page.evaluate((N) => {
      leaderClassKey = 'warrior';
      encounterRound = 5;   // バフ加点を切って攻撃同士の比較にする
      hp = maxHp;
      const cs = ['normal', 'strong-cleave'];
      const fresh = window.__sample(cs, { target: window.__mkTarget({ hp: 40, maxHp: 40 }) }, N);
      const dying = window.__sample(cs, { target: window.__mkTarget({ hp: 3,  maxHp: 40 }) }, N);
      return { freshNormal: fresh['normal'] / N, dyingNormal: dying['normal'] / N };
    }, N);
    check('(G3.4) 瀕死の敵には通常攻撃 (撃破圏) のシェアが上がる',
      rank.dyingNormal > rank.freshNormal + 0.05,
      'fresh=' + rank.freshNormal.toFixed(3) + ' dying=' + rank.dyingNormal.toFixed(3));

    // ボス格は攻撃が上乗せされる
    const bossTilt = await page.evaluate((N) => {
      leaderClassKey = 'warrior';
      encounterRound = 5;
      hp = maxHp;
      const cs = ['normal', 'strong-cleave', 'iron-guard'];
      const zako = window.__sample(cs, { target: window.__mkTarget({ hp: 40, maxHp: 40 }) }, N);
      const boss = window.__sample(cs, { target: window.__mkTarget({ hp: 40, maxHp: 40, def: { name: 'ボス', isBoss: true } }) }, N);
      return { zako: (zako['normal'] + zako['strong-cleave']) / N, boss: (boss['normal'] + boss['strong-cleave']) / N };
    }, N);
    check('(G3.5) 対象がボス格だと攻撃シェアが上がる',
      bossTilt.boss > bossTilt.zako + 0.02,
      'zako=' + bossTilt.zako.toFixed(3) + ' boss=' + bossTilt.boss.toFixed(3));

    // ★ 負のコントロール (N1): 却下された素朴実装なら開幕で攻撃の重みが厳密に 0 になる
    const naive = await page.evaluate(() => {
      const ev = 9;              // 2d8 の期待値
      const fresh = { hp: 40, maxHp: 40 };
      return { w: ev * (1 - fresh.hp / fresh.maxHp) };
    });
    check('(N1/負のコントロール) 素朴な「期待値 × (1-HP比)」は新品の敵に対し厳密に 0 になる',
      naive.w === 0, 'w=' + naive.w);

    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════
  console.log('\n--- (G4) 僧侶の回復頻度が現行 (一様ランダム) より落ちない ---');
  {
    const page = await freshPage(browser);
    await page.evaluate(QUIET);
    await page.evaluate(HELPERS);

    const N = 4000;
    const cure = await page.evaluate((N) => {
      leaderClassKey = 'cleric';
      encounterRound = 3;   // バフ加点を切る (回復 vs 攻撃の素の比較)
      const cs = ['normal', 'cure-light-wounds'];
      const uniform = 1 / cs.length;
      const t = window.__mkTarget({ hp: 40, maxHp: 40 });
      const out = {};
      for (const ratio of [0.7, 0.4, 0.15]) {
        maxHp = 40; hp = Math.round(40 * ratio);
        const s = window.__sample(cs, { target: t }, N);
        out['r' + Math.round(ratio * 100)] = s['cure-light-wounds'] / N;
      }
      out.uniform = uniform;
      return out;
    }, N);
    check('(G4.1) HP70% で回復シェアが一様 (50%) を大きく下回らない',
      cure.r70 >= cure.uniform - 0.10, 'heal=' + cure.r70.toFixed(3) + ' uniform=' + cure.uniform);
    check('(G4.2) HP40% で回復シェアが一様 (50%) 以上',
      cure.r40 >= cure.uniform, 'heal=' + cure.r40.toFixed(3));
    check('(G4.3) HP15% で回復シェアが一様を明確に上回る',
      cure.r15 > cure.uniform + 0.10, 'heal=' + cure.r15.toFixed(3));
    check('(G4.4) HP が下がるほど回復シェアが単調に上がる',
      cure.r15 > cure.r40 && cure.r40 > cure.r70,
      [cure.r70, cure.r40, cure.r15].map(v => v.toFixed(3)).join(' < '));

    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════
  console.log('\n--- (G5) 非有限の重み: warn 0 件 / 壊れた入力でも id を返す ---');
  {
    const page = await freshPage(browser);
    await page.evaluate(QUIET);
    await page.evaluate(HELPERS);

    const robust = await page.evaluate(() => {
      window.__leaderPickWarns = 0;
      leaderClassKey = 'warrior';
      hp = maxHp;
      const cs = ['normal', 'strong-cleave', 'morale'];
      const out = { ids: [] };
      // 壊れた/欠けた入力を一通り通す
      out.ids.push(window.pickLeaderAction(cs, { target: null }).id);
      out.ids.push(window.pickLeaderAction(cs, {}).id);
      out.ids.push(window.pickLeaderAction(cs, { target: { hp: NaN, maxHp: NaN, def: {} } }).id);
      out.ids.push(window.pickLeaderAction(cs, { target: { hp: 10, maxHp: 0, def: {} } }).id);
      out.ids.push(window.pickLeaderAction(['normal', '存在しないスキルID'], { target: window.__mkTarget({}) }).id);
      out.warns = window.__leaderPickWarns;
      out.allValid = out.ids.every(id => cs.includes(id) || id === '存在しないスキルID');
      return out;
    });
    check('(G5.1) 壊れた ctx / 未知のスキル ID でも必ず候補内の id を返す',
      robust.allValid, JSON.stringify(robust.ids));
    check('(G5.2) 非有限の重み warn が 0 件', robust.warns === 0, 'warns=' + robust.warns);

    // ★ 負のコントロール (N2/N3): 却下された実装の壊れ方を実測する
    const negs = await page.evaluate(() => {
      // N2: T=0 で Math.pow(w, 1/T) → Infinity/NaN。`NaN < 0` は常に false なので
      //     全ループが空振りし、末尾の丸め保険が「常に最後の候補」を返す。
      const w = [NaN, NaN, NaN];
      let r = 0.5 * NaN, idx = w.length - 1;
      for (let i = 0; i < w.length; i++) { if ((r -= w[i]) < 0) { idx = i; break; } }
      // N3: `total <= 0` ガードは NaN を検出しない (否定形 `!(total > 0)` なら捕まる)
      const total = NaN;
      return { alwaysLast: idx === w.length - 1, oldGuard: (total <= 0), newGuard: !(total > 0) };
    });
    check('(N2/負のコントロール) 非有限の重みは「常に最後の候補」へ静かに化ける',
      negs.alwaysLast === true);
    check('(N3/負のコントロール) `total <= 0` は NaN を素通しし、`!(total > 0)` だけが捕まえる',
      negs.oldGuard === false && negs.newGuard === true,
      'old=' + negs.oldGuard + ' new=' + negs.newGuard);

    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════
  console.log('\n--- (G7) 理由1行 (フェーズ5): 形式 / 対応 / 発火 / 閾値ゲート ---');
  {
    const page = await freshPage(browser);
    await page.evaluate(QUIET);
    await page.evaluate(HELPERS);

    const N = 3000;

    // (G7.1-G7.3) 回復が切迫している時 (HP10%) に理由が発火し、形式「◇ 技名 ── 一言」を満たす
    const healUrgent = await page.evaluate((N) => {
      leaderClassKey = 'cleric';
      encounterRound = 3;                       // バフ加点を切る (回復 vs 攻撃の素の比較)
      try { allies.length = 0; } catch (e) {}   // 最弱者をリーダーに固定し healRatio を確定させる
      maxHp = 40; hp = Math.round(40 * 0.10);
      const cs = ['normal', 'cure-light-wounds'];
      const t = window.__mkTarget({ hp: 40, maxHp: 40 });   // 新品・非ボス → normal 重み = 0.6
      return window.__sampleWhy(cs, { target: t }, N);
    }, N);
    check('(G7.1) 形式: 全ての非 null why が「◇ 技名 ── 一言」に一致 (malformed 0)',
      healUrgent.malformed === 0, 'malformed=' + healUrgent.malformed);
    check('(G7.2) 切迫した回復で理由が発火する (cure の why が 1 件以上)',
      healUrgent.byId['cure-light-wounds'].whyN > 0,
      'whyN=' + healUrgent.byId['cure-light-wounds'].whyN + ' sample=' + healUrgent.byId['cure-light-wounds'].sample);
    check('(G7.3) 通常攻撃は理由を持たない (normal に紐づく why が 0 件)',
      healUrgent.normalWhy === 0 && healUrgent.byId['normal'].whyN === 0,
      'normalWhy=' + healUrgent.normalWhy + ' normalWhyN=' + healUrgent.byId['normal'].whyN);

    // (G7.4) 閾値ゲート: 軽傷 (HP70%) では回復が選ばれても理由は出ない (weight < 1.5×normal)
    const healMild = await page.evaluate((N) => {
      leaderClassKey = 'cleric';
      encounterRound = 3;
      try { allies.length = 0; } catch (e) {}
      maxHp = 40; hp = Math.round(40 * 0.70);
      const cs = ['normal', 'cure-light-wounds'];
      const t = window.__mkTarget({ hp: 40, maxHp: 40 });
      return window.__sampleWhy(cs, { target: t }, N);
    }, N);
    check('(G7.4) 閾値ゲート: 軽傷では回復は選ばれるが理由は無言 (picked>0 かつ whyN=0)',
      healMild.byId['cure-light-wounds'].n > 0 && healMild.byId['cure-light-wounds'].whyN === 0,
      'picked=' + healMild.byId['cure-light-wounds'].n + ' whyN=' + healMild.byId['cure-light-wounds'].whyN);

    // (G7.5-G7.6) 攻撃の理由: 強斬りが「通常攻撃では届かない敵」を仕留める時に発火し、対象名を含む
    const atk = await page.evaluate((N) => {
      leaderClassKey = 'warrior';
      encounterRound = 5;   // バフ非対象
      hp = maxHp;           // 回復候補を混ぜない
      let baseEV = 4.5;
      try { baseEV = leaderDiceEV((getCurrentWeapon() && getCurrentWeapon().dmgDice) || playerStats.dmgDice) || 4.5; } catch (e) {}
      // 強斬り ev=9。通常攻撃 (baseEV) では届かず強斬りだけが届く HP に置く → 撃破ボーナスで 1.5×normal を確実に超える
      const killHp = Math.min(9, Math.max(2, Math.ceil(baseEV) + 1));
      const cs = ['normal', 'strong-cleave'];
      const t = window.__mkTarget({ hp: killHp, maxHp: 40, def: { name: 'ゴブリン', hp: 40 } });
      return { s: window.__sampleWhy(cs, { target: t }, N), baseEV, killHp };
    }, N);
    check('(G7.5) 攻撃の理由: 強斬りが発火し、対象名を含む (◇ 強斬り ── ゴブリンを 仕留める)',
      atk.s.byId['strong-cleave'].whyN > 0 && /ゴブリン/.test(atk.s.byId['strong-cleave'].sample || ''),
      'whyN=' + atk.s.byId['strong-cleave'].whyN + ' sample=' + atk.s.byId['strong-cleave'].sample +
      ' baseEV=' + atk.baseEV + ' killHp=' + atk.killHp);
    check('(G7.6) 攻撃時も normal は無言 (strong-cleave 混在下でも normal の whyN=0)',
      atk.s.byId['normal'].whyN === 0, 'normalWhyN=' + atk.s.byId['normal'].whyN);

    // (G7.7-G7.8) バフの理由: 開幕 (round1) のみ発火し、途中 (round5) の張り直しは無言
    const buff = await page.evaluate((N) => {
      leaderClassKey = 'warrior';
      hp = maxHp;
      const cs = ['normal', 'morale'];
      const t = window.__mkTarget({ hp: 40, maxHp: 40 });
      encounterRound = 1; const r1 = window.__sampleWhy(cs, { target: t }, N);
      encounterRound = 5; const r5 = window.__sampleWhy(cs, { target: t }, N);
      return { r1: r1.byId['morale'], r5: r5.byId['morale'] };
    }, N);
    check('(G7.7) バフの理由: 開幕 (round1) に士気高揚が発火する (「先手で」を含む)',
      buff.r1.whyN > 0 && /先手で/.test(buff.r1.sample || ''),
      'whyN=' + buff.r1.whyN + ' sample=' + buff.r1.sample);
    check('(G7.8) バフの理由: 途中 (round5) の張り直しは無言 (picked>0 かつ whyN=0)',
      buff.r5.n > 0 && buff.r5.whyN === 0, 'picked=' + buff.r5.n + ' whyN=' + buff.r5.whyN);

    // (G7.9) 自己回復 (cure-minor target:self) は「リーダー自身」を癒す。リーダーが瀕死なら発火し「あなた」を名指す
    const selfHealHurt = await page.evaluate((N) => {
      leaderClassKey = 'elf';
      encounterRound = 3;
      try { allies.length = 0; } catch (e) {}
      maxHp = 40; hp = Math.round(40 * 0.10);
      const cs = ['normal', 'cure-minor'];
      const t = window.__mkTarget({ hp: 40, maxHp: 40 });
      return window.__sampleWhy(cs, { target: t }, N);
    }, N);
    check('(G7.9) 自己回復: リーダー瀕死で cure-minor が発火し「あなた」を名指す',
      selfHealHurt.byId['cure-minor'].whyN > 0 && /あなた/.test(selfHealHurt.byId['cure-minor'].sample || ''),
      'whyN=' + selfHealHurt.byId['cure-minor'].whyN + ' sample=' + selfHealHurt.byId['cure-minor'].sample);

    // (G7.10) 自己回復の要: リーダーが健康なら、別の仲間が瀕死でも cure-minor は無言 (最弱の仲間に釣られない)。
    //          修正前は PT 最弱者 (=仲間) で重み付け→誤発火し「アリアが 危うい」と嘘をついていた (敵対レビュー指摘)。
    const selfHealMislead = await page.evaluate((N) => {
      leaderClassKey = 'elf';
      encounterRound = 3;
      maxHp = 40; hp = Math.round(40 * 0.90);          // リーダーは健康
      try {
        allies.length = 0;
        allies.push({ alive: true, hp: 3, maxHp: 40, x: 0, y: 0,
          npcName: 'アリア', def: { name: 'エルフ', displaySize: 96 }, buffs: {} });   // 瀕死の仲間
      } catch (e) {}
      const cs = ['normal', 'cure-minor'];
      const t = window.__mkTarget({ hp: 40, maxHp: 40 });
      const s = window.__sampleWhy(cs, { target: t }, N);
      const wOldWouldFire = ((1 - 0.075) * 2.5) >= (1.5 * 0.6);   // 修正前の重み (PT最弱者) なら発火していた
      return { cure: s.byId['cure-minor'], mentionsAlly: /アリア/.test(s.byId['cure-minor'].sample || ''), wOldWouldFire };
    }, N);
    check('(G7.10) 自己回復: リーダー健康なら仲間が瀕死でも cure-minor は無言 (whyN=0・仲間名を出さない)',
      selfHealMislead.cure.whyN === 0 && selfHealMislead.mentionsAlly === false,
      'whyN=' + selfHealMislead.cure.whyN + ' mentionsAlly=' + selfHealMislead.mentionsAlly);
    check('(G7.10-neg/負のコントロール) 修正前の重み (PT最弱者) なら誤発火していたはず (テストが空振りでない証明)',
      selfHealMislead.wOldWouldFire === true);

    await page.close();
  }

  // ══════════════════════════════════════════════════════════════════
  console.log('\n--- (G6) 実戦自走: ラウンドが進み、ミラーが同期し、warn が出ない ---');
  {
    const page = await freshPage(browser);
    await sleep(16000);   // autoplay で数ラウンド進ませる

    const live = await page.evaluate(() => ({
      round: (typeof encounterRound !== 'undefined') ? encounterRound : null,
      warns: window.__leaderPickWarns || 0,
      noRound: (window.__diag && window.__diag.report && window.__diag.report.current)
        ? Object.keys(window.__diag.report.current.violations || {}).filter(k => /no-round/.test(k))
        : [],
      logLines: document.querySelectorAll('#combatLog .logLine').length,
      // フェーズ5: 自走中に出た reason 行の健全性 (化けていない / 連続していない)
      reason: (() => {
        const nodes = Array.from(document.querySelectorAll('#combatLog .logLine'));
        const reasons = nodes.filter(n => n.classList.contains('reason'));
        let adjacent = false;   // 隣接2行が両方 reason = 1手番で複数出た痕跡 (無いはず)
        for (let i = 1; i < nodes.length; i++) {
          if (nodes[i].classList.contains('reason') && nodes[i - 1].classList.contains('reason')) adjacent = true;
        }
        const mangled = reasons.filter(n => /\b(sys|crit|heal|miss)\b/.test(n.className)).length;
        const badFmt  = reasons.filter(n => !/^◇ .+ ── .+$/.test(n.textContent || '')).length;
        return { count: reasons.length, adjacent, mangled, badFmt };
      })(),
    }));
    check('(G6.1) 自走中にログが積まれている (戦闘が無言で死んでいない)',
      live.logLines > 0, 'lines=' + live.logLines);
    check('(G6.2) encounterRound が 1 以上の数値として生きている',
      typeof live.round === 'number' && live.round >= 1, 'round=' + live.round);
    check('(G6.3) 診断に combat-no-round 系の違反が出ていない',
      live.noRound.length === 0, JSON.stringify(live.noRound));
    check('(G6.4) 1 戦闘を通して非有限の重み warn が 0 件',
      live.warns === 0, 'warns=' + live.warns);
    check('(G6.5) 自走中の reason 行が autoClassifyLog に化けず、連続もしていない',
      live.reason.mangled === 0 && live.reason.badFmt === 0 && live.reason.adjacent === false,
      JSON.stringify(live.reason));

    // 実プレイの出力口を実際に叩き、cls='reason' が DOM で 'reason' クラスとして生き autoClassifyLog に
    // 化けないことを end-to-end で確認する (配線の flashAction→appendLog と同一経路)。
    const wired = await page.evaluate(() => {
      leaderClassKey = 'warrior';
      encounterRound = 5; hp = maxHp;
      let baseEV = 4.5;
      try { baseEV = leaderDiceEV((getCurrentWeapon() && getCurrentWeapon().dmgDice) || playerStats.dmgDice) || 4.5; } catch (e) {}
      const killHp = Math.min(9, Math.max(2, Math.ceil(baseEV) + 1));
      let why = null;
      for (let i = 0; i < 80 && why == null; i++) {
        why = window.pickLeaderAction(['normal', 'strong-cleave'],
          { target: { hp: killHp, maxHp: 40, alive: true, def: { name: 'ゴブリン', hp: 40 } } }).why;
      }
      if (why == null) return { fired: false };
      appendLog(why, 'reason');   // ← 配線と同一の呼び出し
      const last = document.querySelector('#combatLog .logLine:last-child');
      return {
        fired: true, why,
        cls: last ? last.className : '(none)',
        txt: last ? last.textContent : '',
        isReason:   last ? last.classList.contains('reason') : false,
        notMangled: last ? !/\b(sys|crit|heal|miss)\b/.test(last.className) : false,
      };
    });
    check('(G6.6) 出力口: pickLeaderAction の why が appendLog 経由で reason 行になる (化けない)',
      wired.fired && wired.isReason && wired.notMangled && /^◇ .+ ── .+$/.test(wired.txt || ''),
      JSON.stringify(wired));

    await page.close();
  }

  await browser.close();
  srv.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}

  const realErrs = allPageErrors.filter(m => !/Failed to load resource|favicon|decodeAudioData|Unable to decode/i.test(m));
  check('(Z) pageerror ゼロ', realErrs.length === 0, realErrs.slice(0, 3).join(' | '));

  const passed = results.filter(r => r.ok).length;
  const total  = results.length;
  console.log('\n[driver] RESULT: ' + passed + '/' + total + ' passed');
  if (passed !== total) console.log('[driver] FAILED: ' + results.filter(r => !r.ok).map(r => r.name).join(' | '));
  process.exit(passed === total ? 0 : 1);
})().catch(e => { console.error('[driver] FATAL', e); process.exit(3); });
