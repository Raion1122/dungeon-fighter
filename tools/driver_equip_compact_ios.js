#!/usr/bin/env node
/*
 * driver_equip_compact_ios.js — 「装備画面 所持品カードの iPhone コンパクト化」検証ドライバ
 * ────────────────────────────────────────────────────────────────────────────
 * 直す不具合 (iPhone 390x844 実機スクショで報告):
 *   所持品(下段)の武器カードが「フ / レ / ー / ム / タ / ン / グ」のように 1 文字ずつ縦に
 *   積まれて読めない。原因は 2 段:
 *     (1) .equipGroup が横並び flex で、.equipList と .bagSection(🎒道具袋) が同じ行の兄弟。
 *         道具袋が横幅を奪い、所持品リストが数文字幅まで潰れる。
 *     (2) 潰れた幅で .equipItem が nowrap のまま名前と性能を左右に並べる → 両方が縮んで縦書き。
 *
 * ⚠ 計測は必ず **道具袋を可視にした状態** で行う。空の道具袋では欠陥自体が再現せず、
 *   「直っている」ように見える空振り assert になる。
 *
 * ⚠ 行数は getClientRects() の個数では測れない。.eName は flex アイテム = ブロック化される
 *   ため、何行に折り返れても rect は常に 1 個。Range で中身のテキストを選択して数えること。
 *
 * 使い方 (作業ツリー):
 *   node tools/driver_equip_compact_ios.js --port 8831
 * 負のコントロール (HEAD を git worktree に切り出して同じ assert を落とす):
 *   git worktree add --detach <dir> HEAD
 *   node tools/driver_equip_compact_ios.js --port 8835 --root <dir> --label HEAD
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.resolve(__dirname, '..');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const PORT = parseInt(arg('port', '8831'), 10);
const ROOT = path.resolve(arg('root', REPO));
const LABEL = arg('label', 'WORKTREE');
const SHOT_DIR = arg('shots', path.join(os.tmpdir(), 'df_pptr'));

const IPHONE = { name: 'iphone_port', width: 390, height: 844 };
const DESKTOP = { name: 'desktop', width: 1280, height: 900 };

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
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  console.error('[driver] Chrome/Edge が見つかりません。--browser <path> で指定してください。');
  process.exit(2);
}

const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function startServer(port, root) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        let fp = path.join(root, u);
        if (!fs.existsSync(fp) && root !== REPO) fp = path.join(REPO, u);   // 未コミット素材は本体から借りる
        if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.statusCode = 404; res.end('404'); return; }
        res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        fs.createReadStream(fp).pipe(res);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    srv.on('error', reject);
    srv.listen(port, () => resolve(srv));
  });
}

const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: detail || '' });
  console.log((cond ? '  PASS ' : '  FAIL ') + name + (detail ? '  — ' + detail : ''));
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── ページ内: 準備画面を開いて 所持品/道具袋 が出る状態を作る ────────────────
function seed() {
  // 実機スクショと同じ状態を再現する:
  //   装備中 = フロストブランド(tier4) / 革の盾(tier2 相当) / チェインメイル(tier2)
  //   所持品 武器 = フレームタング + 聖別された剣 (= 名前も性能表記も長い最悪ケース)
  //   ⚠ 短い名前 (ロングソード等) だけで測ると欠陥が再現せず空振りする。
  localStorage.setItem('dragonfighters.weaponIdx', '4');
  localStorage.setItem('dragonfighters.armorIdx', '2');
  localStorage.setItem('dragonfighters.shieldIdx', '4');
  localStorage.setItem('dragonfighters.ownedEquip', JSON.stringify({
    weapons: [], armors: [0, 1, 2], shields: [0, 2, 4],
    _hwm: { weapons: 0, armors: 2, shields: 4 },
  }));
  // gated (マジックアイテム) の所持は名前キー側。これが無いと長名の武器が所持品に出ない。
  localStorage.setItem('dragonfighters.ownedGatedNames',
    JSON.stringify(['フレームタング', 'フロストブランド', '聖別された剣']));
  localStorage.removeItem('dragonfighters.equipWeaponIdx');
  localStorage.removeItem('dragonfighters.allyEquip');
  localStorage.setItem('dragonfighters.partyComposition', JSON.stringify(['warrior']));
  // ⚠ 道具袋を必ず可視にする (これが欠陥の発生条件)
  localStorage.setItem('dragonfighters.inventoryBag', JSON.stringify({
    warrior: { weapons: [1], armors: [], shields: [] },
  }));
  // オンボーディング/シネマの割り込みを止める
  localStorage.setItem('dragonfighters.prepOnboardingSeen', '1');
}

// ── ページ内: 所持品カードの実測 ────────────────────────────────────────────
function measureFn(listId, bagId) {
  const list = document.getElementById(listId);
  if (!list) return { error: 'no list ' + listId };
  const group = list.closest('.equipGroup');
  const bag = document.getElementById(bagId);
  const bagVisible = !!bag && getComputedStyle(bag).display !== 'none';
  const lineCount = (el) => {
    if (!el) return 0;
    const r = document.createRange();
    r.selectNodeContents(el);
    // 折り返し 1 行ごとに rect が 1 個。⚠ el 自身の getClientRects ではダメ
    // (.eName は flex アイテム = ブロック化され常に 1 個になる)。
    const rects = Array.from(r.getClientRects()).filter(x => x.width > 0.5 && x.height > 0.5);
    // 同一行が複数 rect に割れることがある (混植) → top でまとめる
    const tops = new Set(rects.map(x => Math.round(x.top)));
    return tops.size;
  };
  const items = Array.from(list.querySelectorAll('.equipItem')).map(el => {
    const r = el.getBoundingClientRect();
    const n = el.querySelector('.eName');
    const s = el.querySelector('.eSpec');
    return {
      name: n ? n.textContent.trim() : '',
      spec: s ? s.textContent.trim() : '',
      w: Math.round(r.width), h: Math.round(r.height),
      nameLines: lineCount(n), specLines: lineCount(s),
      fontPx: parseFloat(getComputedStyle(el).fontSize),
    };
  });
  const gr = group ? group.getBoundingClientRect() : null;
  const lr = list.getBoundingClientRect();
  return {
    groupW: gr ? Math.round(gr.width) : 0,
    listW: Math.round(lr.width),
    bagVisible,
    bagW: bagVisible ? Math.round(bag.getBoundingClientRect().width) : 0,
    // 道具袋が所持品と「同じ行」に居るか (欠陥の直接指標)。縦に積まれていれば false。
    bagSideBySide: bagVisible ? (bag.getBoundingClientRect().top < lr.bottom - 2) : false,
    items,
  };
}

let step = 0;
const mark = (m) => console.log('[drv] ' + (++step) + ' ' + m);

async function openEquipScreen(page, viewport) {
  mark('viewport ' + viewport.name);
  await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
  await page.goto(`http://localhost:${PORT}/tavern.html`, { waitUntil: 'domcontentloaded', timeout: 25000 });
  mark('goto#1 ok → seed');
  await page.evaluate(seed);
  await page.goto(`http://localhost:${PORT}/tavern.html`, { waitUntil: 'domcontentloaded', timeout: 25000 });
  mark('goto#2 ok → waitForFunction');
  await page.waitForFunction("typeof openPrep==='function' && typeof scenarios!=='undefined'", { timeout: 20000 });
  mark('openPrep 到達 → 呼び出し');
  // ⚠ openPrep() を await してはいけない。受注ナレ → パーティ・マッチング演出 の順で
  //   進み、マッチング演出は **タップを待って止まる** 仕様 (project_party_match_cinematic)。
  //   headless では誰もタップしないので evaluate ごと永久に固まる (3 分ハングの原因)。
  //   発火だけさせて、画面中央をタップし続けて #prep が出るまで進める。
  await page.evaluate(() => {
    const sc = scenarios.find(s => s.id === 'goblin-mine');
    if (!(selection.partyComposition && selection.partyComposition.length)) selection.partyComposition = ['warrior'];
    Promise.resolve(openPrep(sc)).catch(() => {});
  });
  const isPrepShown = () => page.evaluate(() => {
    const p = document.getElementById('prep');
    if (!p || getComputedStyle(p).display === 'none') return false;
    const l = document.getElementById('equipWeaponList');
    return !!l && l.children.length > 0 && l.getBoundingClientRect().width > 1;
  });
  let shown = false;
  for (let i = 0; i < 45 && !shown; i++) {
    shown = await isPrepShown();
    if (shown) break;
    // 演出のタップ送り (PM_TAP_GATE=500ms 以上あける)
    await page.mouse.click(Math.round(viewport.width / 2), Math.round(viewport.height / 2));
    await sleep(550);
  }
  if (!shown) throw new Error('準備画面 (#prep) が可視にならなかった — 演出の進行に失敗');
  mark('準備画面 可視 → タブ固定');
  await page.evaluate(() => {
    const ov = document.getElementById('prologueOverlay');
    if (ov) ov.style.display = 'none';
    window.__equipTV.setTab('warrior');
  });
  await sleep(600);
  mark('計測可能');
}

(async () => {
  const puppeteer = loadPuppeteer();
  console.log(`[drv] label=${LABEL} root=${ROOT} port=${PORT}`);
  const srv = await startServer(PORT, ROOT);
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required',
           '--no-first-run', '--no-default-browser-check', '--disable-extensions',
           '--user-data-dir=' + require('./_pptr_profile')('df_pptr_profile_eqcompact_')],
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

  // ═══ iPhone 390x844 ═══════════════════════════════════════════════════════
  await openEquipScreen(page, IPHONE);
  const ip = {
    weapon: await page.evaluate(measureFn, 'equipWeaponList', 'bagWeaponSection'),
    shield: await page.evaluate(measureFn, 'equipShieldList', 'bagShieldSection'),
    armor:  await page.evaluate(measureFn, 'equipArmorList',  'bagArmorSection'),
  };
  console.log('[iPhone 390x844] ' + JSON.stringify(ip, null, 1));

  const wp = ip.weapon;
  const ownedItems = wp.items.filter(it => !/購入可|所持なし|両手武器/.test(it.name));

  console.log('── iPhone 390x844 ──');
  check('(1) 前提: 道具袋が可視 = 欠陥の発生条件を再現している', wp.bagVisible === true,
        'bagVisible=' + wp.bagVisible);
  check('(2) 前提: 所持品カードが 2 件以上並んでいる', ownedItems.length >= 2,
        'n=' + ownedItems.length);
  check('(3) 道具袋が所持品リストと同じ行に居ない (縦積み)', wp.bagSideBySide === false,
        'sideBySide=' + wp.bagSideBySide);
  check('(4) 所持品リスト幅がグループ幅の 78% 以上', wp.groupW > 0 && wp.listW / wp.groupW >= 0.78,
        `list=${wp.listW}/group=${wp.groupW} = ${(wp.listW / Math.max(1, wp.groupW) * 100).toFixed(1)}%`);
  for (const it of ownedItems) {
    check(`(5) 名前が 1 行に収まる: ${it.name}`, it.nameLines === 1, `lines=${it.nameLines} w=${it.w}`);
  }
  for (const it of ownedItems) {
    check(`(6) 性能が 2 行以内: ${it.name}`, it.specLines <= 2, `lines=${it.specLines} "${it.spec}"`);
  }
  for (const it of ownedItems) {
    check(`(7) カード高さ ≤ 76px: ${it.name}`, it.h <= 76, `h=${it.h}`);
  }
  for (const it of ownedItems) {
    check(`(8) タップ域を維持 (高さ ≥ 40px): ${it.name}`, it.h >= 40, `h=${it.h}`);
  }
  for (const kind of ['shield', 'armor']) {
    const m = ip[kind];
    const its = (m.items || []).filter(it => !/購入可|所持なし|両手武器/.test(it.name));
    check(`(9) ${kind}: 所持品リスト幅がグループ幅の 78% 以上`,
          m.groupW > 0 && m.listW / m.groupW >= 0.78, `${m.listW}/${m.groupW}`);
    check(`(10) ${kind}: 全カードの名前が 1 行`, its.every(it => it.nameLines === 1),
          its.map(it => it.name + ':' + it.nameLines).join(' '));
  }

  // 機能非退行: 所持品カードのタップで装備が切り替わる (DOM を1段深くしても壊れていない)
  const equipSwap = await page.evaluate(() => {
    const before = window.__equipTV.getSel('warrior').weapon;
    const list = document.getElementById('equipWeaponList');
    const card = Array.from(list.querySelectorAll('.equipItem'))
      .find(el => !el.classList.contains('locked'));
    const cardName = card ? card.querySelector('.eName').textContent.trim() : null;
    if (card) card.click();
    const after = window.__equipTV.getSel('warrior').weapon;
    const sum = document.getElementById('equipEquippedSummary');
    return { before, after, cardName, summary: sum ? sum.textContent : '' };
  });
  check('(11) 所持品カードのタップで装備が切り替わる',
        equipSwap.before !== equipSwap.after && equipSwap.cardName &&
        equipSwap.summary.indexOf(equipSwap.cardName) >= 0,
        `weapon ${equipSwap.before}→${equipSwap.after} card="${equipSwap.cardName}"`);

  const shotIphone = path.join(SHOT_DIR, `equipcompact_${LABEL}_iphone.png`);
  await page.evaluate(() => {
    const t = document.getElementById('charTabs');
    const p = t ? t.closest('.prepPanel') : null;
    if (p) p.scrollIntoView({ block: 'start' });
  });
  await sleep(250);
  await page.screenshot({ path: shotIphone, fullPage: false });

  // ═══ desktop 1280x900 (非退行) ════════════════════════════════════════════
  await openEquipScreen(page, DESKTOP);
  const dt = await page.evaluate(measureFn, 'equipWeaponList', 'bagWeaponSection');
  console.log('[desktop 1280x900] ' + JSON.stringify(dt, null, 1));
  const dtOwned = dt.items.filter(it => !/購入可|所持なし|両手武器/.test(it.name));
  console.log('── desktop 1280x900 (非退行) ──');
  check('(12) desktop: 道具袋が所持品リストと同じ行に居ない', dt.bagSideBySide === false,
        'sideBySide=' + dt.bagSideBySide);
  check('(13) desktop: 全カードの名前が 1 行', dtOwned.every(it => it.nameLines === 1),
        dtOwned.map(it => it.name + ':' + it.nameLines).join(' '));
  check('(14) desktop: カード高さ ≤ 48px (据え置きの見た目)', dtOwned.every(it => it.h <= 48),
        dtOwned.map(it => it.h).join(','));
  check('(15) desktop: フォント 13px 据え置き', dtOwned.every(it => Math.abs(it.fontPx - 13) < 0.6),
        dtOwned.map(it => it.fontPx).join(','));

  const shotDesktop = path.join(SHOT_DIR, `equipcompact_${LABEL}_desktop.png`);
  await page.evaluate(() => {
    const t = document.getElementById('charTabs');
    const p = t ? t.closest('.prepPanel') : null;
    if (p) p.scrollIntoView({ block: 'start' });
  });
  await sleep(250);
  await page.screenshot({ path: shotDesktop, fullPage: false });

  const realErrs = errs.filter(e => !/favicon|Failed to load resource|ERR_|net::/i.test(e));
  check('(16) ページエラーなし', realErrs.length === 0, realErrs.slice(0, 3).join(' | '));

  await browser.close();
  srv.close();

  const pass = results.filter(r => r.ok).length;
  console.log(`\n=== ${LABEL}: ${pass}/${results.length} PASS ===`);
  console.log('shots: ' + shotIphone + ' / ' + shotDesktop);
  process.exit(pass === results.length ? 0 : 2);
})().catch(e => { console.error('DRIVER FAIL:', e.stack || e.message); process.exit(1); });
