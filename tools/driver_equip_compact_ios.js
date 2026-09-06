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
 *
 * ══ ⚠⚠⚠ 2026-09-06 (#55) 作り直し ═══════════════════════════════════════════
 *   #55「出発準備画面の廃止」で **#prep は二度と可視にならない**。このドライバは
 *   「#prep が可視になる」を待っていたので、着手前から exit 1 で赤かった
 *   (実装依頼書 #55 §2-10 の実測)。⛔ 退役させない —— 装備 UI の iPhone 検査は
 *   #55 後こそ必要になる (着せ替えの口が引き出し 1 つに集約されたため)。
 *
 *   ⭐ 測る場所を移した: 準備画面の #equipWeaponList → **マッチング画面の引き出しの
 *     装備段** (#pmDrawerEquip_weapon / #pmDrawerBag_weapon)。測る中身 (道具袋が
 *     所持品と同じ行に居ないか / 名前が 1 行に収まるか / タップ域) は 1 つも変えていない。
 *   ⚠⚠ 進め方も変えた。**画面中央のクリックでは演出は進まない** (#35 以後、閉じる口は
 *     #pmDepart ただ 1 つ)。出発の口が出るまで待ってからカードを押す。
 *   ⚠ ?recruittalk=0 を必ず付ける。#54 で既定の編成は「声を掛けた相手だけ」= ソロに
 *     なったので、付けないと (0) の母集団 (パーティ 4 人) が原理的に立たない。
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
/* ⭐⭐ 測るのは **いちばん枠が要る状態**。実装依頼書 #7 (quest-recruit-size) で
   「依頼の★の数 → 同行する冒険者の数」が入り、goblin-mine (★1) は計 2 人になった。
   そのまま goblin-mine で測り続けると、いちばん人数の少ない準備画面を見て
   「レイアウトが壊れていない」と報告することになる。→ NPC 3 人 = 計 4 人になる
   orc-fort (★3) を既定にする。

   ⭐⭐⭐ #7 の着手時に実測して分かったこと (思い込みで期待値を書かない):
   **#charTabs はパーティ人数に依存しない。** renderCharTabs() は PARTY_SLOTS
   (全 6 職) を回す「職業別プリセット board」で、編成に居ない職のタブも出る。
   → 「タブが減って溢れなくなり自明に緑」という筋は **この実装では成立しない**。
      代わりに (0) が「パーティ人数 (= #7 が動かした値)」と
      「タブ枚数がそれに引きずられていないこと」を **両方の実数** で押さえる。
      タブを人数連動に変えた誰かが居れば (0) が赤くなる。
   負のコントロール: --scenario goblin-mine を渡すと party=2 になり (0) が落ちる。

   ⚠⚠ 2026-09-06 (#55): #prep を出さなくなったので **#charTabs はもう描かれない**。
     上の「タブは人数非依存」という知見は #prep 側の話として残すが、(0) が数えるのは
     **マッチング画面のカード枚数 (= パーティ人数)** へ移した。EXPECT_TABS は退役。 */
const PREP_SCENARIO = arg('scenario', 'orc-fort');
const EXPECT_PARTY = parseInt(arg('party', '4'), 10);   // orc-fort (★3) = 主人公1 + NPC3

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

/* #55: 「主人公のカードの引き出しの装備段を開いた状態」まで進める。
 * ⚠ openPrep() を await してはいけない。マッチング演出は **タップを待って止まる** ので
 *   headless では evaluate ごと永久に固まる。⭐ しかも #55 後は openPrep の末尾が
 *   departToScenario() = **ページごと index.html へ飛ぶ**。発火だけさせてポーリングする。
 * ⛔ 画面中央は叩かない。#35 以後そこは死んでいる (旧実装が赤かった原因そのもの)。 */
const TAVERN_URL = () => `http://localhost:${PORT}/tavern.html?recruittalk=0`;

async function openEquipScreen(page, viewport) {
  mark('viewport ' + viewport.name);
  await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
  await page.goto(TAVERN_URL(), { waitUntil: 'domcontentloaded', timeout: 25000 });
  mark('goto#1 ok → seed');
  await page.evaluate(seed);
  await page.goto(TAVERN_URL(), { waitUntil: 'domcontentloaded', timeout: 25000 });
  mark('goto#2 ok → waitForFunction');
  await page.waitForFunction("typeof openPrep==='function' && typeof scenarios!=='undefined'", { timeout: 20000 });
  mark('openPrep 到達 → 呼び出し');
  await page.evaluate((scId) => {
    const sc = scenarios.find(s => s.id === scId);
    if (!(selection.partyComposition && selection.partyComposition.length)) selection.partyComposition = ['warrior'];
    Promise.resolve(openPrep(sc)).catch(() => {});
  }, PREP_SCENARIO);

  /* 受注ナレ (#prologueOverlay) を送りながら、出発の口 (#pmDepart) が出るまで待つ。
     ⚠ #pmDepart の hidden が外れる = 全員確定 + 猶予明け = カードを押せる状態。 */
  let ready = false;
  for (let i = 0; i < 200 && !ready; i++) {
    const st = await page.evaluate(() => {
      const q = (id) => document.getElementById(id);
      const dep = q('pmDepart');
      const ov = q('partyMatchOverlay');
      const prol = q('prologueOverlay');
      const prolVis = !!(prol && getComputedStyle(prol).display !== 'none');
      if (prolVis) prol.click();
      return {
        ready: !!(dep && !dep.hidden && dep.getClientRects().length > 0),
        cinema: !!(ov && ov.style.display === 'flex'),
        prol: prolVis,
      };
    });
    ready = st.ready;
    if (!ready) await sleep(300);
  }
  if (!ready) throw new Error('マッチング画面の出発の口 (#pmDepart) が出なかった — 演出の進行に失敗');
  mark('出発の口 可視 → 主人公のカードを押す');

  /* 主人公のカード (先頭) を押して引き出しを開き、装備段を開く。 */
  await page.evaluate(() => {
    const cols = document.querySelectorAll('#pmColumns .pmColumn');
    if (cols[0]) cols[0].click();
  });
  await sleep(320);
  await page.evaluate(() => {
    const eq = document.getElementById('pmDrawerEquip');
    if (eq) eq.open = true;
  });
  await sleep(400);

  const pop = await page.evaluate(() => {
    const cols = document.querySelectorAll('#pmColumns .pmColumn');
    const drawer = document.getElementById('pmDrawer');
    const eq = document.getElementById('pmDrawerEquip');
    return {
      n: cols.length,                                     // カード枚数 = パーティ人数
      prepId: (typeof prepScenario === 'object' && prepScenario) ? prepScenario.id : null,
      members: (selection.partyMembers || []).length,
      drawerOpen: !!(drawer && !drawer.hidden),
      equipOpen: !!(eq && eq.open),
      title: ((document.getElementById('pmDrawerTitle') || {}).textContent || '').trim(),
    };
  });
  mark('計測可能 (カード=' + pop.n + ' / prepScenario=' + pop.prepId + ' / party=' + pop.members
    + ' / 引き出し=' + pop.drawerOpen + ' / 装備段=' + pop.equipOpen + ' / ' + pop.title + ')');
  return pop;
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
  const tabsIphone = await openEquipScreen(page, IPHONE);
  /* #55: 測る先は引き出しの装備段。⛔ #prep 側の id (equipWeaponList 等) は
     ?prepskip=0 でしか描かれないので、ここで掴むと永久に空になる。 */
  const ip = {
    weapon: await page.evaluate(measureFn, 'pmDrawerEquip_weapon', 'pmDrawerBag_weapon'),
    shield: await page.evaluate(measureFn, 'pmDrawerEquip_shield', 'pmDrawerBag_shield'),
    armor:  await page.evaluate(measureFn, 'pmDrawerEquip_armor',  'pmDrawerBag_armor'),
  };
  console.log('[iPhone 390x844] ' + JSON.stringify(ip, null, 1));

  const wp = ip.weapon;
  const ownedItems = wp.items.filter(it => !/購入可|所持なし|両手武器/.test(it.name));

  console.log('── iPhone 390x844 ──');
  /* ⭐⭐ 母集団ガード。#7 でパーティ人数が依頼ごとに変わるようになったので、
     「いちばん枠が要る状態で測っているか」を **実数そのもの**で押さえる。
     これが無いと、将来また人数が減ったときに狭い画面を見て黙って緑になる。 */
  /* #55: 母集団ガードを引き出し側へ移した。⭐ 「カード枚数 = パーティ人数」なので
     旧 (0) の「タブは人数非依存」という主張はもう成立しない (タブが無い)。
     代わりに **引き出しと装備段が本当に開いているか**を数で押さえる —— これが無いと
     以降の全 assert が「要素が無いので違反 0 件」で静かに緑になる。 */
  check(`(0) 前提: いちばん枠が要る状態で測っている (${PREP_SCENARIO} = パーティ ${EXPECT_PARTY} 人 / 引き出しの装備段が開いている)`,
        tabsIphone.prepId === PREP_SCENARIO && tabsIphone.members === EXPECT_PARTY
        && tabsIphone.n === EXPECT_PARTY && tabsIphone.drawerOpen === true && tabsIphone.equipOpen === true,
        `prepScenario=${tabsIphone.prepId} / partyMembers=${tabsIphone.members} (期待 ${EXPECT_PARTY})`
        + ` / カード=${tabsIphone.n} / 引き出し=${tabsIphone.drawerOpen} / 装備段=${tabsIphone.equipOpen}`);
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
  // ⚠ #55: 「装備中」サマリは引き出しの段の先頭 (#pmDrawerEquipSummary) を見る。
  //   ⛔ #equipEquippedSummary (準備画面側) を見ると、押しても更新されないので永久に赤くなる。
  const equipSwap = await page.evaluate(() => {
    const before = window.__equipTV.getSel('warrior').weapon;
    const list = document.getElementById('pmDrawerEquip_weapon');
    if (!list) return { before, after: before, cardName: null, summary: '', why: 'リストが無い' };
    const card = Array.from(list.querySelectorAll('.equipItem'))
      .find(el => !el.classList.contains('locked'));
    const cardName = card ? card.querySelector('.eName').textContent.trim() : null;
    if (card) card.click();
    const after = window.__equipTV.getSel('warrior').weapon;
    const sum = document.getElementById('pmDrawerEquipSummary');
    return { before, after, cardName, summary: sum ? sum.textContent : '', why: '' };
  });
  check('(11) 所持品カードのタップで装備が切り替わり、段の先頭の「装備中」に反映される',
        equipSwap.before !== equipSwap.after && equipSwap.cardName &&
        equipSwap.summary.indexOf(equipSwap.cardName) >= 0,
        `weapon ${equipSwap.before}→${equipSwap.after} card="${equipSwap.cardName}" ${equipSwap.why}`);

  const shotIphone = path.join(SHOT_DIR, `equipcompact_${LABEL}_iphone.png`);
  await page.evaluate(() => {
    /* #55: 目視の対象は引き出しの装備段。⛔ #charTabs は #prep の中で、もう出ない。 */
    const eq = document.getElementById('pmDrawerEquip');
    if (eq) eq.scrollIntoView({ block: 'start' });
  });
  await sleep(250);
  await page.screenshot({ path: shotIphone, fullPage: false });

  // ═══ desktop 1280x900 (非退行) ════════════════════════════════════════════
  await openEquipScreen(page, DESKTOP);
  const dt = await page.evaluate(measureFn, 'pmDrawerEquip_weapon', 'pmDrawerBag_weapon');
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
    /* #55: 目視の対象は引き出しの装備段。⛔ #charTabs は #prep の中で、もう出ない。 */
    const eq = document.getElementById('pmDrawerEquip');
    if (eq) eq.scrollIntoView({ block: 'start' });
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
