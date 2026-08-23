#!/usr/bin/env node
/*
 * driver_action_priority.js — 実装依頼書 #19「行動の優先度」検証ドライバ
 * ═══════════════════════════════════════════════════════════════════════════
 *   node tools/driver_action_priority.js [--headful] [--port N] [--browser <path>]
 *   node tools/driver_action_priority.js --negative     ← 負のコントロール
 *
 * ── セクションと実装状況 (段階的に足していく骨組み) ───────────────────────
 *   §0 装置 (母集団の確認 / index↔tavern の二重定義突合)   … PENDING (項目②)
 *   §1 主人公 — 重み倍率がクランプに食われていない          … PENDING (項目②)
 *   §2 仲間 — 先出しが効き、指定外は不変                    … PENDING (項目③)
 *   §3 道中詠唱                                             … PENDING (項目④)
 *   §4 バフ退避 (戦闘開始で主人公だけ剥がれない)            … PENDING (項目④)
 *   §5 撤退スイッチ ?actionpri=0                            … PENDING (項目④)
 *   §6 酒場 UI                                              … 実装済 (本ファイル)
 *
 *   ⛔ PENDING は **黙って緑にしない**。RESULT 行に PASSED / FAILED / PENDING の
 *      3 つの数を必ず出し、「まだ測っていない」を数で見えるようにする。
 *
 * ── ⚠ 踏みやすい罠 (既存ドライバから引き継ぎ) ────────────────────────────
 *  - ROOT は必ず path.resolve を通す。区切り文字のまま join すると配信が全 404 になり、
 *    症状はタイムアウトだけで原因が見えない。
 *  - classic script 直下の let/const/function は **window に載らない**。
 *    page.evaluate(() => PARTY_SLOTS) のように **裸の識別子**で読む。
 *  - same-origin の localStorage / sessionStorage はページ遷移をまたいで生き残る →
 *    seed() で毎回 purge してからリロードする。
 *  - openPrep() を **await してはいけない**。マッチング演出はタップを待って止まるので
 *    headless では永久に固まる。発火だけさせ、画面中央をタップし続けて #prep を出す。
 *  - ⭐⭐ 本番ファイルに計測シームを置かない (CLAUDE.md の changelog ガード)。
 *    必要な細工は **配信スナップショットへ実行時に注入**する (下の NEG_ANCHOR)。
 *  - ⭐⭐ 配信バイトを起動時に凍結する。別窓が同じリポを触っても、この run が読むのは 1 枚。
 *
 * ── 負のコントロール (--negative) ──────────────────────────────────────────
 *   N3: renderActionPriority() の「装備している技だけに絞る」フィルタを外す
 *       (= 候補を skillPool 全部にする) → **(6b) が赤くなる**こと。
 *       赤くならなければ exit 1 (テストが空振りしている証拠)。
 *       ⚠ 注入点が 1 箇所ちょうど見つからなければ、走らせる前に exit 1 で止まる
 *         (アンカーが腐ったまま「注入したつもり」で緑になるのを防ぐ)。
 *   ※ 依頼書 §8 の N1/N2/N4/N5/N6 は後続項目 (②③④) の担当。ここでは入れない。
 */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ⚠ path.resolve 必須
const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg  = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.indexOf('--' + n) >= 0;
const HEADFUL  = flag('headful');
const NEGATIVE = flag('negative');
const PORT     = parseInt(arg('port', '8843'), 10);

/* ══════════════════════════════════════════════════════════════════════════
 * 配信バイトの凍結 + 負のコントロールの注入
 * ══════════════════════════════════════════════════════════════════════════ */
const FROZEN = {};
for (const rel of ['tavern.html', 'index.html']) {
  FROZEN['/' + rel] = fs.readFileSync(path.join(ROOT, rel));
}
// ⚠ 実装側のこの 1 行が「装備している技だけに絞る」フィルタの入口。
const NEG_ANCHOR = 'const equippedIds = apEquippedIdsFor(slot, classKey);';
const NEG_PATCH  = 'const equippedIds = slot.skillPool.map(sk => sk.id); /* N3: フィルタを外した変異 */';
if (NEGATIVE) {
  const src   = FROZEN['/tavern.html'].toString('utf8');
  const parts = src.split(NEG_ANCHOR);
  const hits  = parts.length - 1;
  if (hits !== 1) {
    console.error('[driver] 負のコントロール N3 の注入点が ' + hits + ' 箇所 (期待 1)。アンカーが腐っています:');
    console.error('         ' + NEG_ANCHOR);
    process.exit(1);
  }
  FROZEN['/tavern.html'] = Buffer.from(parts.join(NEG_PATCH), 'utf8');
  console.log('[driver] ★ 負のコントロール N3 を注入しました (renderActionPriority の絞り込みを外す)');
}

function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  console.error('[driver] puppeteer-core が見つかりません');
  process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
                   'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'])
    if (fs.existsSync(c)) return c;
  console.error('[driver] Chrome / Edge が見つかりません (--browser <path>)');
  process.exit(2);
}
// ⚠ MIME テーブルを持たせ忘れると全 500 でページが空になる (シームが undefined に見える)
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

function startServer() {
  return new Promise((res, rej) => {
    const s = http.createServer((rq, rs) => {
      try {
        let u = decodeURIComponent(rq.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        if (FROZEN[u]) {                                     // ← 凍結済み (+ 変異済み) を優先
          rs.setHeader('Content-Type', MIME['.html']);
          rs.end(FROZEN[u]);
          return;
        }
        const fp = path.join(ROOT, u);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { rs.statusCode = 404; rs.end('404'); return; }
        rs.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        fs.createReadStream(fp).pipe(rs);
      } catch (e) { rs.statusCode = 500; rs.end('500'); }
    });
    s.on('error', rej); s.listen(PORT, () => res(s));
  });
}

/* ══════════════════════════════════════════════════════════════════════════
 * 集計 (PASSED / FAILED / PENDING の 3 値)
 * ══════════════════════════════════════════════════════════════════════════ */
const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, pending: false, detail: detail === undefined ? '' : String(detail) });
  console.log((cond ? '  OK  ' : '  NG  ') + name + (detail !== undefined ? '  -- ' + detail : ''));
}
function pending(name, why) {
  results.push({ name, ok: false, pending: true, detail: why || '' });
  console.log('  --  ' + name + '   [PENDING] ' + (why || ''));
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const pageErrors = [];

/* ══════════════════════════════════════════════════════════════════════════
 * 期待表 — 依頼書の実測 (§2-6 / §2-9) をドライバ側に持つ。
 * ⚠ 実装からコピーしない。実装が変わったらここが赤くなるのが正しい。
 * ══════════════════════════════════════════════════════════════════════════ */
const CLASS_KEYS = ['warrior', 'dwarf', 'cleric', 'mage', 'elf', 'rogue'];
const SITUATIONS = ['general', 'mob', 'boss', 'travel'];
// §2-6: 「呪文スロットを消費し、敵を対象に取らない呪文」の全数 = 10 件
const EXPECT_TRAVEL_IDS = ['bless', 'shield-of-faith', 'striking',
  'cure-light-wounds', 'cure-moderate-wounds', 'cure-serious-wounds', 'cure-critical-wounds',
  'arcane-shield', 'cure-minor', 'haste'];
// §2-9 の表: 道中の行が出るのは僧侶・魔法使い・エルフだけ (戦士/ドワーフ/盗賊は 0 件)
const EXPECT_TRAVEL_CLASSES = ['cleric', 'mage', 'elf'];

const setEq = (a, b) => {
  const A = new Set(a), B = new Set(b);
  if (A.size !== B.size) return false;
  for (const x of A) if (!B.has(x)) return false;
  return true;
};

/* ══════════════════════════════════════════════════════════════════════════
 * ページ内: 初期化。
 *   Lv5 (累積 XP 10000) にする = スキル枠 3。既定の 3 スキルがそのまま枠に収まり、
 *   (6c) で外した技を戻せる (Lv1 は枠 1 なので再装備が塞がり、後片付けができない)。
 * ══════════════════════════════════════════════════════════════════════════ */
function seed() {
  try {
    [localStorage, sessionStorage].forEach(function (store) {
      Object.keys(store).forEach(function (k) {
        if (k.indexOf('dragonfighters.') === 0 || k.indexOf('df.') === 0) store.removeItem(k);
      });
    });
  } catch (e) {}
  try {
    localStorage.setItem('dragonfighters.xp', '10000');
    localStorage.setItem('dragonfighters.partyComposition', JSON.stringify(['warrior']));
    localStorage.setItem('dragonfighters.prologueSeen', '1');
    localStorage.setItem('dragonfighters.prepOnboardingSeen', '1');
  } catch (e) {}
}

const PREP_SCENARIO = 'goblin-mine';

async function openPrepScreen(browser, viewport) {
  const page = await browser.newPage();
  page.on('pageerror', e => pageErrors.push(viewport.name + ' :: ' + e.message));
  await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
  await page.goto('http://localhost:' + PORT + '/tavern.html', { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.evaluate(seed);
  await page.goto('http://localhost:' + PORT + '/tavern.html', { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForFunction("typeof openPrep === 'function' && typeof scenarios !== 'undefined'", { timeout: 20000 });
  // ⚠ await しない (マッチング演出がタップ待ちで止まるため)
  await page.evaluate((scId) => {
    const sc = scenarios.find(s => s.id === scId);
    if (!(selection.partyComposition && selection.partyComposition.length)) selection.partyComposition = ['warrior'];
    Promise.resolve(openPrep(sc)).catch(() => {});
  }, PREP_SCENARIO);
  const shownNow = () => page.evaluate(() => {
    const p = document.getElementById('prep');
    if (!p || getComputedStyle(p).display === 'none') return false;
    const rows = document.getElementById('apRows');
    return !!rows && rows.getBoundingClientRect().width > 1;
  });
  let shown = false;
  for (let i = 0; i < 45 && !shown; i++) {
    shown = await shownNow();
    if (shown) break;
    await page.mouse.click(Math.round(viewport.width / 2), Math.round(viewport.height / 2));
    await sleep(550);
  }
  if (!shown) throw new Error('準備画面 (#prep) が可視にならなかった — 演出の進行に失敗 [' + viewport.name + ']');
  await page.evaluate(() => { const ov = document.getElementById('prologueOverlay'); if (ov) ov.style.display = 'none'; });
  await sleep(300);
  return page;
}

/* 1 職ぶんの観測。⭐ 「今の枠」はドライバが **selection.partySkills / CLERIC 表から独立に**
   組み立て、実装が描いた option と突き合わせる (2 経路)。 */
async function readClass(page, classKey) {
  return page.evaluate((ck) => {
    window.__equipTV.setTab(ck);
    const slot = PARTY_SLOTS.find(s => s && s.classKey === ck);
    const out = {
      classKey: ck,
      poolIds: slot.skillPool.map(sk => sk.id),
      selectCount: document.querySelectorAll('#apRows select').length,
      rowCount: document.querySelectorAll('#apRows .apRow').length,
      hintText: (document.getElementById('apHint') || {}).textContent || '',
      rows: {},
    };
    // ── 経路 B: ドライバが元データから組み立てる「今そのキャラが枠に入れている技」 ──
    if (ck === 'cleric') {
      const auto = getClericSlotsTV(getLevelFromXP(inventory.xp));
      out.equippedByData = slot.skillPool
        .filter(sk => (auto[sk.id] || 0) > 0 && isSpellKnownTV(ck, sk.id)).map(sk => sk.id);
    } else {
      const owned = new Set(Array.isArray(selection.partySkills[ck]) ? selection.partySkills[ck] : []);
      out.equippedByData = slot.skillPool.filter(sk => owned.has(sk.id)).map(sk => sk.id);
    }
    for (const sit of ['general', 'mob', 'boss', 'travel']) {
      const sel = document.getElementById('apSel_' + ck + '_' + sit);
      if (!sel) { out.rows[sit] = { exists: false }; continue; }
      const rowEl = sel.closest('.apRow');
      out.rows[sit] = {
        exists: true,
        visible: !!rowEl && getComputedStyle(rowEl).display !== 'none',
        values: Array.prototype.map.call(sel.options, o => o.value),
        labels: Array.prototype.map.call(sel.options, o => o.textContent),
        value: sel.value,
      };
    }
    return out;
  }, classKey);
}

(async () => {
  const puppeteer = loadPuppeteer();
  const srv = await startServer();
  console.log('[driver] serving ' + ROOT + '  :' + PORT + (NEGATIVE ? '   [NEGATIVE]' : ''));

  const profile = require('./_pptr_profile')('df_actionpri_');
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--user-data-dir=' + profile],
  });

  try {
    /* ════════════════════════════════════════════════════════════════════
     * §0〜§5 — 後続項目の担当。黙って緑にせず PENDING として数える。
     * ════════════════════════════════════════════════════════════════════ */
    console.log('\n--- (§0) 装置: 母集団と二重定義の突合 ---');
    pending('(0a) window.apPreferredId("mage","boss") が仕込んだ ID を返す', '項目② (index.html STEP3) 未実装');
    pending('(0b) tavern の TRAVEL_CASTABLE_IDS と index の AP_TRAVEL_CASTABLE が集合として一致 (10 件)', '項目② (index.html STEP3) 未実装');
    pending('(0c) executeSkillOn のラッパが 1 回以上捕まえている', '項目③ (STEP4-b) 未実装');
    pending('(0d) 道中テストで敵が alert/chase になった瞬間が 1 回以上ある', '項目④ (STEP5) 未実装');

    console.log('\n--- (§1) 主人公: 重み倍率がクランプに食われていない ---');
    pending('(1a) 僧侶リーダー boss=bless でシェアが有意に上がる', '項目② (STEP4-a) 未実装');
    pending('(1b) シェア差が AP_BOOST^(1/T) から独立計算した期待シェアと一致 (±0.05)', '項目② (STEP4-a) 未実装');
    pending('(1c) LEADER_W_MAX に張り付く候補でもシェアが上がる (罠 §2-4 の本丸)', '項目② (STEP4-a) 未実装');
    pending('(1d) RNG パリティ: pickLeaderAction 1 回あたり Math.random ちょうど 1 回', '項目② (STEP4-a) 未実装');

    console.log('\n--- (§2) 仲間: 先出しが効き、指定外は不変 ---');
    pending('(2a) 魔法使い仲間 boss=fireball でボス戦 1 手目の fireball が増える', '項目③ (STEP4-b) 未実装');
    pending('(2b) 盗賊 (確率ゲート 0 本) でも先出しが効く', '項目③ (STEP4-b) 未実装');
    pending('(2c) 指定 null のとき apGateP が 20 箇所の base 値と厳密に等しい', '項目③ (STEP4-c) 未実装');
    pending('(2d) 戦士の仲間では executeSkillOn が 1 回も呼ばれない', '項目③ (STEP4-b) 未実装');

    console.log('\n--- (§3) 道中詠唱 ---');
    pending('(3a) 僧侶仲間 travel=bless が探索フェーズ中に発動する', '項目④ (STEP5) 未実装');
    pending('(3b) 敵が idle しかいない間は一度も発動しない', '項目④ (STEP5) 未実装');
    pending('(3c) 1 回の接敵で 2 回以上は撃たない (ラッチ)', '項目④ (STEP5) 未実装');
    pending('(3d) travel に battle-roar を手で書き込んでも発動しない (2 重ガード)', '項目④ (STEP5) 未実装');

    console.log('\n--- (§4) バフ退避 (罠 §2-5) ---');
    pending('(4a) 戦闘開始時に主人公と仲間で atkBonusRemaining>0 が一致する', '項目④ (STEP6) 未実装');
    pending('(4b) 道中詠唱をしていない戦闘では開始時の playerBuffs が全部 0', '項目④ (STEP6) 未実装');

    console.log('\n--- (§5) 撤退スイッチ ?actionpri=0 ---');
    pending('(5a) index.html?actionpri=0 で apPreferredId が null を返す', '項目④ (STEP7) 未実装');
    pending('(5b) tavern.html?actionpri=0 で #actionPrioritySection 非表示 + 保存値は残る', '項目④ (STEP7) 未実装');

    /* ════════════════════════════════════════════════════════════════════
     * §6 — 酒場 UI (本項目の担当)
     * ════════════════════════════════════════════════════════════════════ */
    console.log('\n--- (§6-装置) 母集団ガード ---');
    const page = await openPrepScreen(browser, { name: 'desktop', width: 1280, height: 900 });

    const seams = await page.evaluate(() => ({
      hasSituations: typeof AP_SITUATIONS !== 'undefined' && Array.isArray(AP_SITUATIONS),
      situationKeys: (typeof AP_SITUATIONS !== 'undefined' ? AP_SITUATIONS : []).map(s => s.key),
      travelIds:     (typeof TRAVEL_CASTABLE_IDS !== 'undefined') ? TRAVEL_CASTABLE_IDS.slice() : null,
      hasRender:     typeof renderActionPriority === 'function',
      apKeys:        Object.keys((selection && selection.actionPriority) || {}),
      apShape:       Object.keys(((selection && selection.actionPriority) || {}).mage || {}),
      heroLv:        getLevelFromXP(inventory.xp),
      sectionExists: !!document.getElementById('actionPrioritySection'),
      // 「道中に選べる ID」が本当に呪文 (mpCost>0) で、呪文職のプールに実在するか
      travelIdFacts: ((typeof TRAVEL_CASTABLE_IDS !== 'undefined') ? TRAVEL_CASTABLE_IDS : []).map(id => {
        for (const slot of PARTY_SLOTS) {
          const hit = (slot.skillPool || []).find(sk => sk.id === id);
          if (hit) return { id, classKey: slot.classKey, mpCost: hit.mpCost || 0 };
        }
        return { id, classKey: null, mpCost: 0 };
      }),
    }));
    check('(S1) AP_SITUATIONS / TRAVEL_CASTABLE_IDS / renderActionPriority が裸の識別子で読める',
      seams.hasSituations && Array.isArray(seams.travelIds) && seams.hasRender && seams.sectionExists,
      JSON.stringify({ sit: seams.hasSituations, travel: !!seams.travelIds, render: seams.hasRender, dom: seams.sectionExists }));
    check('(S2) AP_SITUATIONS の 4 状況が general/mob/boss/travel',
      setEq(seams.situationKeys, SITUATIONS) && seams.situationKeys.length === 4,
      JSON.stringify(seams.situationKeys));
    check('(S3) TRAVEL_CASTABLE_IDS が §2-6 の全数 10 件と集合として一致',
      Array.isArray(seams.travelIds) && seams.travelIds.length === 10 && setEq(seams.travelIds, EXPECT_TRAVEL_IDS),
      'n=' + (seams.travelIds || []).length + ' ' + JSON.stringify(seams.travelIds));
    // ⭐ 2 経路目: 「呪文スロットを消費する呪文だけ」を **本番のスキル定義から** 検算する。
    //    1戦1回スキル (battle-roar 等 = mpCost 無し) が紛れ込んだらここが赤くなる。
    const badTravel = (seams.travelIdFacts || []).filter(f => !(f.mpCost > 0) || ['cleric', 'mage', 'elf'].indexOf(f.classKey) < 0);
    check('(S4) TRAVEL_CASTABLE_IDS の全件が「呪文スロットを消費する呪文 (mpCost>0)」で呪文職のプールに実在',
      badTravel.length === 0, badTravel.length ? JSON.stringify(badTravel) : '10/10 OK');
    check('(S5) selection.actionPriority が 6 職 × 4 枠で初期化されている',
      setEq(seams.apKeys, CLASS_KEYS) && setEq(seams.apShape, SITUATIONS),
      JSON.stringify(seams.apKeys) + ' / mage=' + JSON.stringify(seams.apShape));
    check('(S6) 主人公 Lv がスキル枠 3 の帯にいる (外した技を戻せる = (6c) の後片付けが成立する)',
      seams.heroLv >= 5, 'Lv=' + seams.heroLv);

    // 6 職ぶんの観測
    const obs = {};
    for (const ck of CLASS_KEYS) obs[ck] = await readClass(page, ck);

    check('(S7) 母集団: 6 職すべてで #apRows に select が 4 個ある',
      CLASS_KEYS.every(ck => obs[ck].selectCount === 4),
      CLASS_KEYS.map(ck => ck + ':' + obs[ck].selectCount).join(' '));
    // ⚠⚠ (6b) が空振りしない証明。「装備していない技」が 1 つも無いなら包含は自明で無意味。
    const notEquipped = CLASS_KEYS.map(ck => ({
      ck, n: obs[ck].poolIds.filter(id => obs[ck].equippedByData.indexOf(id) < 0).length,
    }));
    check('(S8) 母集団: 6 職すべてで「装備していない技」が 1 つ以上実在する ((6b) が自明でない証明)',
      notEquipped.every(x => x.n > 0), notEquipped.map(x => x.ck + ':' + x.n).join(' '));
    check('(S9) 母集団: 6 職すべてで「枠に入れている技」が 1 つ以上ある (候補が空でないこと)',
      CLASS_KEYS.every(ck => obs[ck].equippedByData.length > 0),
      CLASS_KEYS.map(ck => ck + ':' + obs[ck].equippedByData.length).join(' '));
    check('(S10) #apHint が「傾向」であることを明示している',
      /傾向/.test(obs.warrior.hintText) && /射程|スロット/.test(obs.warrior.hintText),
      JSON.stringify(obs.warrior.hintText));

    console.log('\n--- (§6) 酒場 UI ---');

    // ── (6a) 4 枠の存在と、道中行の出し分け ──────────────────────────────
    const missing = [];
    for (const ck of CLASS_KEYS) {
      for (const sit of ['general', 'mob', 'boss']) {
        const r = obs[ck].rows[sit];
        if (!r.exists || !r.visible) missing.push(ck + '/' + sit + (r.exists ? '(非表示)' : '(不在)'));
      }
    }
    check('(6a-1) apSel_<classKey>_<sit> が general/mob/boss は 6 職すべてで存在し可視',
      missing.length === 0, missing.length ? missing.join(' ') : '18/18 OK');

    const travelSeen = CLASS_KEYS.filter(ck => obs[ck].rows.travel.exists && obs[ck].rows.travel.visible);
    check('(6a-2) 道中の行は僧侶・魔法使い・エルフのみ表示 (戦士・ドワーフ・盗賊は非表示)',
      setEq(travelSeen, EXPECT_TRAVEL_CLASSES),
      '表示された職 = ' + JSON.stringify(travelSeen) + ' / 期待 ' + JSON.stringify(EXPECT_TRAVEL_CLASSES));
    // ⭐ 2 経路目: 「道中の候補が実在するか」を元データ (枠 ∩ 道中許可リスト) から独立に決めて突合
    const travelByData = CLASS_KEYS.filter(ck =>
      obs[ck].equippedByData.some(id => EXPECT_TRAVEL_IDS.indexOf(id) >= 0));
    check('(6a-3) 2 経路突合: 「枠 ∩ 道中許可リストが非空」の職と、実際に道中行が出た職が一致',
      setEq(travelByData, travelSeen),
      'データ由来 = ' + JSON.stringify(travelByData) + ' / 描画 = ' + JSON.stringify(travelSeen));

    // ── (6b) 装備していない技は選択肢に出ない ────────────────────────────
    const leak = [];
    const wholePool = [];
    for (const ck of CLASS_KEYS) {
      for (const sit of SITUATIONS) {
        const r = obs[ck].rows[sit];
        if (!r.exists) continue;
        const vals = r.values.filter(v => v !== '');
        const allowed = (sit === 'travel')
          ? obs[ck].equippedByData.filter(id => EXPECT_TRAVEL_IDS.indexOf(id) >= 0)
          : obs[ck].equippedByData;
        const extra = vals.filter(v => allowed.indexOf(v) < 0);
        if (extra.length) leak.push(ck + '/' + sit + ' -> ' + JSON.stringify(extra));
        if (vals.length && setEq(vals, obs[ck].poolIds)) wholePool.push(ck + '/' + sit);
      }
    }
    check('(6b-1) 装備していない技が選択肢に 1 つも出ていない (24 枠すべて)',
      leak.length === 0, leak.length ? leak.join(' ') : '漏れ 0');
    check('(6b-2) 選択肢が skillPool 丸ごとになっている枠が 1 つも無い (絞り込みが実際に効いている)',
      wholePool.length === 0, wholePool.length ? wholePool.join(' ') : '0 枠');
    check('(6b-3) 先頭の選択肢は必ず「おまかせ」(value="")',
      CLASS_KEYS.every(ck => SITUATIONS.every(sit => {
        const r = obs[ck].rows[sit];
        return !r.exists || (r.values[0] === '' && r.labels[0] === 'おまかせ');
      })), 'ok');

    // ── (6c) 装備を外すと「おまかせ」へ戻り、localStorage も null ────────
    const set6c = await page.evaluate(() => {
      window.__equipTV.setTab('warrior');
      const sel = document.getElementById('apSel_warrior_general');
      if (!sel) return { ok: false, why: 'apSel_warrior_general が無い' };
      const values = Array.prototype.map.call(sel.options, o => o.value);
      if (values.indexOf('strong-cleave') < 0) return { ok: false, why: '強斬りが候補に無い', values };
      sel.__apMark = 'before-change';                       // ⛔ 再帰再描画の検出用マーカー
      sel.value = 'strong-cleave';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      const after = document.getElementById('apSel_warrior_general');
      let ls = null;
      try { ls = JSON.parse(localStorage.getItem('dragonfighters.actionPriority') || 'null'); } catch (e) {}
      return {
        ok: true,
        mem: selection.actionPriority.warrior.general,
        ls: (ls && ls.warrior) ? ls.warrior.general : '(キー無し)',
        sameNode: after === sel,
        markSurvived: after ? after.__apMark === 'before-change' : false,
        selValue: after ? after.value : null,
      };
    });
    check('(6c-1) change で selection と localStorage の両方に skillId が入る',
      set6c.ok && set6c.mem === 'strong-cleave' && set6c.ls === 'strong-cleave',
      JSON.stringify(set6c));
    // ⛔ 依頼書の禁止事項「change で renderCharLoadout() を再帰で呼ばない」の機械検査。
    //    再帰すると select が作り直されてノードが入れ替わり、プルダウンが選べなくなる。
    check('(6c-2) change ハンドラが select を作り直していない (再帰再描画をしていない)',
      set6c.sameNode === true && set6c.markSurvived === true && set6c.selValue === 'strong-cleave',
      'sameNode=' + set6c.sameNode + ' mark=' + set6c.markSurvived + ' value=' + set6c.selValue);

    const drop6c = await page.evaluate(() => {
      // 本番の経路で装備を外す (.skillItem のクリック → saveSelections + renderCharLoadout)
      const slot = PARTY_SLOTS.find(s => s && s.classKey === 'warrior');
      const skills = slot.skillPool.filter(sk => !sk.mpCost);
      const idx = skills.findIndex(sk => sk.id === 'strong-cleave');
      const items = document.querySelectorAll('#skillList .skillItem');
      if (idx < 0 || !items[idx]) return { ok: false, idx, n: items.length };
      const before = (selection.partySkills.warrior || []).slice();
      items[idx].click();
      const sel = document.getElementById('apSel_warrior_general');
      let ls = null;
      try { ls = JSON.parse(localStorage.getItem('dragonfighters.actionPriority') || 'null'); } catch (e) {}
      return {
        ok: true, before, after: (selection.partySkills.warrior || []).slice(),
        selValue: sel ? sel.value : '(select 無し)',
        selValues: sel ? Array.prototype.map.call(sel.options, o => o.value) : [],
        mem: selection.actionPriority.warrior.general,
        ls: (ls && ls.warrior) ? ls.warrior.general : '(キー無し)',
      };
    });
    check('(6c-3) 前提: 本番の経路で 強斬り の装備が実際に外れた',
      drop6c.ok && drop6c.before.indexOf('strong-cleave') >= 0 && drop6c.after.indexOf('strong-cleave') < 0,
      JSON.stringify({ before: drop6c.before, after: drop6c.after }));
    check('(6c-4) 装備を外して再描画すると select が「おまかせ」へ戻り、候補からも消える',
      drop6c.selValue === '' && drop6c.selValues.indexOf('strong-cleave') < 0,
      'value=' + JSON.stringify(drop6c.selValue) + ' values=' + JSON.stringify(drop6c.selValues));
    check('(6c-5) selection と localStorage の値も null へ書き戻されている (古い ID を黙って残さない)',
      drop6c.mem === null && drop6c.ls === null,
      'mem=' + JSON.stringify(drop6c.mem) + ' ls=' + JSON.stringify(drop6c.ls));

    // 後片付け: 強斬り を戻す (以降の観測を汚さない)
    const restore = await page.evaluate(() => {
      const slot = PARTY_SLOTS.find(s => s && s.classKey === 'warrior');
      const skills = slot.skillPool.filter(sk => !sk.mpCost);
      const idx = skills.findIndex(sk => sk.id === 'strong-cleave');
      const items = document.querySelectorAll('#skillList .skillItem');
      if (idx >= 0 && items[idx]) items[idx].click();
      return (selection.partySkills.warrior || []).slice();
    });
    check('(6c-6) 後片付け: 強斬り を再装備できた (Lv 帯とスキル枠の前提が生きている)',
      restore.indexOf('strong-cleave') >= 0, JSON.stringify(restore));

    await page.close();

    // ── (6d) compact (iPhone 幅) で横スクロールしない ───────────────────
    const pageM = await openPrepScreen(browser, { name: 'iphone', width: 390, height: 844 });
    const m = await pageM.evaluate(() => {
      const out = {};
      const keys = ['warrior', 'dwarf', 'cleric', 'mage', 'elf', 'rogue'];
      for (const ck of keys) {
        window.__equipTV.setTab(ck);
        const rows = document.getElementById('apRows');
        const sec  = document.getElementById('actionPrioritySection');
        out[ck] = {
          selects: document.querySelectorAll('#apRows select').length,
          scrollW: rows ? rows.scrollWidth : -1,
          clientW: rows ? rows.clientWidth : -1,
          secScrollW: sec ? sec.scrollWidth : -1,
          secClientW: sec ? sec.clientWidth : -1,
        };
      }
      return out;
    });
    const mKeys = Object.keys(m);
    check('(6d-0) 母集団: iPhone 幅でも 6 職すべてで #apRows に select が 4 個ある',
      mKeys.every(ck => m[ck].selects === 4), mKeys.map(ck => ck + ':' + m[ck].selects).join(' '));
    check('(6d-1) 母集団: #apRows が実際に幅を持って描かれている (0 幅で自明に緑にならない)',
      mKeys.every(ck => m[ck].clientW > 50), mKeys.map(ck => ck + ':' + m[ck].clientW).join(' '));
    const over = mKeys.filter(ck => m[ck].scrollW > m[ck].clientW);
    check('(6d-2) compact (390px) で #apRows が横スクロールを起こさない (scrollWidth <= clientWidth)',
      over.length === 0,
      over.length ? over.map(ck => ck + ' ' + m[ck].scrollW + '>' + m[ck].clientW).join(' ')
                  : mKeys.map(ck => ck + ' ' + m[ck].scrollW + '<=' + m[ck].clientW).join(' '));
    const secOver = mKeys.filter(ck => m[ck].secScrollW > m[ck].secClientW);
    check('(6d-3) compact で #actionPrioritySection 自体も横スクロールを起こさない',
      secOver.length === 0,
      secOver.length ? secOver.map(ck => ck + ' ' + m[ck].secScrollW + '>' + m[ck].secClientW).join(' ') : 'OK');

    await pageM.close();
  } catch (e) {
    check('(FATAL) ドライバが最後まで走った', false, e && e.message);
  }

  await browser.close();
  srv.close();

  const realErrs = pageErrors.filter(m => !/Failed to load resource|favicon|decodeAudioData|Unable to decode|play\(\) failed|NotAllowedError/i.test(m));
  check('(Z) pageerror ゼロ', realErrs.length === 0, realErrs.slice(0, 3).join(' | '));

  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok && !r.pending).length;
  const pend   = results.filter(r => r.pending).length;
  console.log('\n[driver] RESULT: PASSED ' + passed + ' / FAILED ' + failed + ' / PENDING ' + pend);
  if (failed) console.log('[driver] FAILED: ' + results.filter(r => !r.ok && !r.pending).map(r => r.name).join(' | '));
  if (pend)   console.log('[driver] PENDING: §0〜§5 は後続項目 (②③④) の担当 — 黙って緑にしていない');

  if (NEGATIVE) {
    // 負のコントロールの判定: N3 (絞り込みを外す) で (6b) が赤くなること。
    const b = results.filter(r => r.name.indexOf('(6b-') === 0);
    const reds = b.filter(r => !r.ok);
    console.log('\n[driver] 負のコントロール N3 の判定: (6b) ' + reds.length + '/' + b.length + ' 本が赤');
    if (reds.length === 0) {
      console.log('[driver] NG: N3 を注入したのに (6b) が緑のまま = テストが空振りしています');
      process.exit(1);
    }
    console.log('[driver] OK: N3 で (6b) が赤くなった: ' + reds.map(r => r.name).join(' , '));
    process.exit(0);
  }
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error('[driver] FATAL', e); process.exit(3); });
