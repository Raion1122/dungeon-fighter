#!/usr/bin/env node
/*
 * driver_warrior_variants_sprite.js — 戦士 変種 1-3 の codex1 差替 (npc-female-warrior) 検証ドライバ
 *
 *   node tools/driver_warrior_variants_sprite.js [--headful] [--browser <path>] [--port N] [--root <dir>]
 *
 * 対象は index.html + tavern.html。2026-07-29 の差替内容:
 *   - 正規 (変種 index 0)  assets/warrior_{walk,attack}.png       <- **無改変** (既に codex1 ironvale-vanguard)
 *   - 変種 index 1-3 共有  assets/warrior_npcfemale_{walk,attack}.png <- codex1 npc-female-warrior (新規)
 *
 *   G1  配線: SPRITE_VARIANTS.warrior / getSpriteSet が期待 URL を返す (変種 1-3 は同一 1 枚)
 *   G2  実体: 新 PNG 2 枚が 200 で読め、規格サイズ (walk 576x384 / attack 480x384) である
 *   G3  体高パリティ: 画面上の体高が主人公戦士と同値。walk<->attack の変動が閾値内
 *   G4  重複コマ: row3 の全コマが互いに異なる (サイズ検査を素通りする軸)
 *   G5  当たり判定不変: CLASS_DEFS.warrior の displaySize / sprite が据置
 *   G6  tavern: PARTY_PORTRAIT_SPRITES.warrior が 4 要素で全部 200
 *
 * ⚠️ 本ドライバの肝は **同一 run に内包した負のコントロール** (N1-N4)。
 *    `/__base__/<path>` ルートで `git show HEAD:<path>` の生バイトを同時配信し、
 *    「差替前に warrior_npcfemale_walk.png は無い」「差替前の index/tavern は旧 chibi を指す」を
 *    *正の assert* として測る。baseline が PASS するだけでは空振り (作業ツリーを 2 回測る事故)
 *    を検出できない。
 *
 * ⚠️ 今回は **正規 (index 0) を触らない差替**なので、N4 で
 *    「差替前の warrior_walk.png と作業ツリーが画素シグネチャまで一致」を *正の assert* にする。
 *    「変えた」だけでなく「変えていない」も測らないと、台帳の --all 再パックで主人公が
 *    巻き添えになった事故を検出できない。
 *
 * ⚠️ SPRITE_VARIANTS / getSpriteSet / CLASS_DEFS / LEADER_SPRITES は classic script 直下の
 *    const/function なので window に載らない。page.evaluate の中から **bare 名** で読む
 *    (グローバル字句環境はスコープチェーンで引ける。window.SPRITE_VARIANTS は undefined)。
 */
const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execFileSync } = require('child_process');

const argv = process.argv.slice(2);
const arg  = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const ROOT    = path.resolve(arg('root', path.resolve(__dirname, '..')));
const HEADFUL = flag('headful');
const PORT    = parseInt(arg('port', '8879'), 10);

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

/* ⚠⚠ 負のコントロールの基準は **HEAD ではなく「差替が入る直前のコミット」に固定する**。
 *   HEAD にすると差替をコミットした瞬間に `HEAD === 作業ツリー` になり、N ブロック
 *   (「差替前は旧 chibi だった」= 差分の実在証明) が **自己失効して赤いまま安定する**。
 *   ⭐ 「機能が入る直前」は歴史的事実なので、以後どれだけコミットが進んでも陳腐化しない。
 *   ⚠ 「一致する」型 (巻き添えが無い証明) も同じ基準でよい: 1be27b8 は変種 3 種だけを
 *     差し替えており、正規 warrior_walk.png はこの時点から不変であることを測れる。 */
const BASE_REV = '1be27b8^';   // 1be27b8 = 「戦士の変種3種を codex1 素材へ差替」。その親 = 差替前。

// 差替前の生バイトを取り出す (存在しないパスは null)。差替が「本当に効いたか」を測る唯一の手段。
function baseBytes(rel) {
  try {
    return execFileSync('git', ['show', BASE_REV + ':' + rel.replace(/\\/g, '/')],
                        { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
  } catch (e) { return null; }
}

function startServer() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        if (u.startsWith('/__base__/')) {
          const rel = u.slice('/__base__/'.length);
          const buf = baseBytes(rel);
          if (!buf) { res.statusCode = 404; res.end('404 (not in HEAD)'); return; }
          res.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()] || 'application/octet-stream');
          res.end(buf);
          return;
        }
        const fp = path.join(ROOT, u);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.statusCode = 404; res.end('404'); return; }
        res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        fs.createReadStream(fp).pipe(res);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    srv.on('error', reject);
    srv.listen(PORT, '127.0.0.1', () => resolve(srv));
  });
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log((ok ? '  ok  ' : '  NG  ') + name + (ok ? '' : '   << ' + (detail === undefined ? '' : detail)));
}

// ページ内で使う計測ヘルパー (check_attack_scale.py と同じ物差し)。
//   bodyH: alpha>64 の行ごとの画素数 cnt を取り、top = cnt >= max*0.25 の最上行 (細い突起を
//          頭頂と誤認しない) / bottom = 不透明が 1 個でもある最下行。
//   x0/x1: セル内の横方向の実占有域。剣を水平に突き出すコマがセルからはみ出していないかを見る。
const PAGE_HELPERS = `
window.__sprMeasure = async function (url, cell, cols, row) {
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i); i.onerror = () => rej(new Error('load fail ' + url));
    i.src = url;
  });
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0);
  const out = { w: img.naturalWidth, h: img.naturalHeight, frames: [] };
  for (let c = 0; c < cols; c++) {
    const d = cx.getImageData(c * cell, row * cell, cell, cell).data;
    const cnt = new Array(cell).fill(0);
    let sig = 0, x0 = cell, x1 = -1;
    for (let y = 0; y < cell; y++) {
      for (let x = 0; x < cell; x++) {
        const o = (y * cell + x) * 4;
        if (d[o + 3] > 64) {
          cnt[y]++;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          sig = (sig * 31 + (y * cell + x) + d[o] + d[o+1] * 3 + d[o+2] * 7) >>> 0;
        }
      }
    }
    const peak = Math.max.apply(null, cnt);
    if (peak <= 0) { out.frames.push(null); continue; }
    let top = 0; while (cnt[top] < peak * 0.25) top++;
    let bottom = cell - 1; while (cnt[bottom] === 0) bottom--;
    out.frames.push({ bodyH: bottom - top + 1, feet: bottom, x0: x0, x1: x1, sig: sig });
  }
  return out;
};
`;

(async () => {
  const puppeteer = loadPuppeteer();
  const srv = await startServer();
  const base = 'http://127.0.0.1:' + PORT;
  const profile = require('./_pptr_profile')('df_warvar_');
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: !HEADFUL, userDataDir: profile,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
  });
  const allPageErrors = [];

  const WALK_SIZE = { w: 576, h: 384 }, ATK_SIZE = { w: 480, h: 384 };
  const med = (m) => {
    const xs = m.frames.filter(Boolean).map(f => f.bodyH).sort((a, b) => a - b);
    return xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2;
  };
  const feetOf = (m) => m.frames.filter(Boolean).map(f => f.feet);

  // ═══════════ index.html ═══════════
  {
    const page = await browser.newPage();
    page.on('pageerror', e => allPageErrors.push(String(e && e.message || e)));
    await page.evaluateOnNewDocument(PAGE_HELPERS);
    await page.goto(base + '/index.html?autoplay=1&intel=0', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof SPRITE_VARIANTS !== 'undefined', { timeout: 20000 });

    // ── G1 配線 ─────────────────────────────────────────────
    const wire = await page.evaluate(() => {
      const out = { len: SPRITE_VARIANTS.warrior.length, sets: [] };
      for (let v = 0; v < 4; v++) {
        const s = getSpriteSet('warrior', v);
        out.sets.push({ walk: s.walk, attack: s.attack, ws: s.walkSize, as: s.attackSize,
                        label: s.label, hasGuard: !!s.guard });
      }
      out.player = (typeof LEADER_SPRITES !== 'undefined') ? LEADER_SPRITES.warrior : null;
      out.custom = (typeof CUSTOM_SHEET_CLASSES !== 'undefined') && CUSTOM_SHEET_CLASSES.has('warrior');
      out.wrap = getSpriteSet('warrior', 9).walk === getSpriteSet('warrior', 1).walk;
      return out;
    });
    check('(G1.1) SPRITE_VARIANTS.warrior が 4 変種のまま', wire.len === 4, wire.len);
    check('(G1.2) 変種 0 (正規) は無改変 = warrior_walk.png?v=8',
      /assets\/warrior_walk\.png\?v=8/.test(wire.sets[0].walk), wire.sets[0].walk);
    check('(G1.3) 変種 0 の attack も無改変 = warrior_attack.png?v=11',
      /assets\/warrior_attack\.png\?v=11/.test(wire.sets[0].attack), wire.sets[0].attack);
    check('(G1.4) 変種 1-3 が warrior_npcfemale_walk.png を共有',
      [1, 2, 3].every(v => /assets\/warrior_npcfemale_walk\.png/.test(wire.sets[v].walk)),
      JSON.stringify(wire.sets.slice(1).map(s => s.walk)));
    check('(G1.5) 変種 1-3 が warrior_npcfemale_attack.png を共有',
      [1, 2, 3].every(v => /assets\/warrior_npcfemale_attack\.png/.test(wire.sets[v].attack)),
      JSON.stringify(wire.sets.slice(1).map(s => s.attack)));
    check('(G1.6) 変種 1-3 に旧 chibi (heavy/female/knight) が残っていない',
      [1, 2, 3].every(v => !/warrior_(heavy|female|knight)_/.test(wire.sets[v].walk + wire.sets[v].attack)),
      JSON.stringify(wire.sets.slice(1)));
    check('(G1.7) 新規ファイル名なので ?v= を付けていない (同名上書きではない)',
      [1, 2, 3].every(v => !/npcfemale_[a-z]+\.png\?/.test(wire.sets[v].walk + wire.sets[v].attack)),
      JSON.stringify(wire.sets.slice(1).map(s => [s.walk, s.attack])));
    check('(G1.8) label は 3 種のまま (内部識別子は温存)',
      wire.sets[1].label === '重戦士' && wire.sets[2].label === '女戦士' && wire.sets[3].label === '騎士',
      JSON.stringify(wire.sets.map(s => s.label)));
    check('(G1.9) 全変種のシート寸法指定が規格どおり',
      wire.sets.every(s => s.ws === '576px 384px' && s.as === '480px 384px'),
      JSON.stringify(wire.sets.map(s => [s.ws, s.as])));
    check('(G1.10) guard は変種 0 のみが持つ (1-3 は従来どおり simple_knight へフォールバック)',
      wire.sets[0].hasGuard === true && [1, 2, 3].every(v => wire.sets[v].hasGuard === false),
      JSON.stringify(wire.sets.map(s => s.hasGuard)));
    check('(G1.11) 主人公用 LEADER_SPRITES.warrior は無改変 (?v=8 / ?v=11 + guard)',
      !!wire.player && /warrior_walk\.png\?v=8/.test(wire.player.walk)
        && /warrior_attack\.png\?v=11/.test(wire.player.attack) && !!wire.player.guard,
      JSON.stringify(wire.player));
    check('(G1.12) warrior は専用シートクラスのまま', wire.custom === true, wire.custom);
    check('(G1.13) 範囲外 index は剰余で丸まる (getSpriteSet の既存契約)', wire.wrap === true, wire.wrap);

    // ── G2 実体 (404 なし / 規格サイズ) ─────────────────────
    const sheets = [
      ['warrior_npcfemale_walk.png',   WALK_SIZE, 6],
      ['warrior_npcfemale_attack.png', ATK_SIZE,  5],
      ['warrior_walk.png?v=8',         WALK_SIZE, 6],
      ['warrior_attack.png?v=11',      ATK_SIZE,  5],
    ];
    const measured = {};
    for (const [f, size, cols] of sheets) {
      const key = f.split('?')[0];
      const m = await page.evaluate((u, c) => window.__sprMeasure(u, 96, c, 3), '/assets/' + f, cols)
        .catch(e => ({ err: String(e && e.message || e), frames: [] }));
      measured[key] = m;
      check('(G2) ' + key + ' が 200 かつ ' + size.w + 'x' + size.h,
        !m.err && m.w === size.w && m.h === size.h, JSON.stringify({ w: m.w, h: m.h, err: m.err }));
    }
    for (const [f, , cols] of sheets) {
      const key = f.split('?')[0];
      const m = measured[key];
      check('(G2) ' + key + ' の row3 に ' + cols + ' コマ実在 (透明コマなし)',
        !!m && Array.isArray(m.frames) && m.frames.length === cols && m.frames.every(Boolean),
        m && m.frames && JSON.stringify(m.frames.map(x => !!x)));
    }

    // ── G3 体高パリティ ─────────────────────────────────────
    const nw = med(measured['warrior_npcfemale_walk.png']);
    const na = med(measured['warrior_npcfemale_attack.png']);
    const ww = med(measured['warrior_walk.png']);
    check('(G3.1) 主人公戦士の体高を実測できている (56px 前後)', ww >= 50 && ww <= 62, ww);
    check('(G3.2) 変種の walk 体高が主人公戦士と同値', nw === ww, 'npcfemale=' + nw + ' warrior=' + ww);
    check('(G3.3) 変種: walk->attack の体高変動が ±5% 以内',
      Math.abs((na - nw) / nw) < 0.05, ((na - nw) / nw * 100).toFixed(2) + '%');
    check('(G3.4) 変種: walk と attack の接地線が一致 (足が浮かない/沈まない)',
      Math.abs(Math.max.apply(null, feetOf(measured['warrior_npcfemale_walk.png'])) -
               Math.max.apply(null, feetOf(measured['warrior_npcfemale_attack.png']))) <= 1,
      JSON.stringify([feetOf(measured['warrior_npcfemale_walk.png']),
                      feetOf(measured['warrior_npcfemale_attack.png'])]));
    check('(G3.5) 全コマがセル内に収まる (足元がセル底を突き抜けない)',
      Object.values(measured).every(m => m.frames.filter(Boolean).every(f => f.feet <= 95)),
      JSON.stringify(Object.entries(measured).map(([k, m]) => [k, Math.max.apply(null, feetOf(m))])));
    // ⚠ この素材の最大リスク: attack frame 3/4 で剣を水平に前へ突き出す (素材 bboxW 439/447px)。
    //   player シートの真の制約は「最終スケールでの横リーチ <= セル半幅」なので x1 を直接測る。
    const xspan = ['warrior_npcfemale_walk.png', 'warrior_npcfemale_attack.png']
      .map(k => measured[k].frames.filter(Boolean).map(f => [f.x0, f.x1]));
    check('(G3.6) 変種: 剣を突き出すコマもセル右端で切れていない (x1 <= 95)',
      xspan.every(fr => fr.every(([, x1]) => x1 <= 95)), JSON.stringify(xspan));
    check('(G3.7) 変種: セル左端でも切れていない (x0 >= 1)',
      xspan.every(fr => fr.every(([x0]) => x0 >= 1)), JSON.stringify(xspan));

    // ── G4 重複コマ ─────────────────────────────────────────
    for (const key of ['warrior_npcfemale_walk.png', 'warrior_npcfemale_attack.png']) {
      const sigs = measured[key].frames.filter(Boolean).map(f => f.sig);
      check('(G4) ' + key + ' の row3 に重複コマなし',
        sigs.length > 0 && new Set(sigs).size === sigs.length, JSON.stringify(sigs));
    }

    // ── G5 当たり判定不変 ───────────────────────────────────
    const hit = await page.evaluate(() => ({
      disp: (typeof CLASS_DEFS !== 'undefined') ? CLASS_DEFS.warrior.displaySize : null,
      sprite: (typeof CLASS_DEFS !== 'undefined') ? CLASS_DEFS.warrior.sprite : null,
    }));
    check('(G5.1) CLASS_DEFS.warrior.displaySize が 96 据置 (当たり判定不変)', hit.disp === 96, hit.disp);
    check('(G5.2) CLASS_DEFS.warrior.sprite は無改変 (?v=8 のまま)',
      /warrior_walk\.png\?v=8/.test(hit.sprite || ''), hit.sprite);

    // ── N1-N2 負のコントロール (差替前の生バイトと比較) ──────
    const headNew = await page.evaluate(async () => {
      try { await window.__sprMeasure('/__base__/assets/warrior_npcfemale_walk.png', 96, 6, 3); return 'loaded'; }
      catch (e) { return 'missing'; }
    });
    check('(N1) 差替前に warrior_npcfemale_walk.png は存在しない (新規追加である証明)',
      headNew === 'missing', headNew);

    const headIdx = baseBytes('index.html');
    const headVarLines = headIdx
      ? String(headIdx).split('\n').filter(l => /warrior_(heavy|female|knight)_walk\.png/.test(l))
      : [];
    check('(N2.1) 差替前の index.html を取得できている', !!headIdx, '(git show 失敗)');
    check('(N2.2) 差替前の戦士変種 3 行は旧 chibi を指す (差分が実在する)',
      headVarLines.length === 3, headVarLines.length + ' 行');
    check('(N2.3) 作業ツリーでは旧 chibi 参照が消えている',
      !wire.sets.some(s => /warrior_(heavy|female|knight)_/.test(s.walk + s.attack)),
      JSON.stringify(wire.sets.map(s => s.walk)));

    // ── N4 「触っていない」ことの正の assert ────────────────
    // 台帳の --all 再パックで正規シート (index 0) が巻き添えで変わっていないかを画素で見る。
    const headWarrior = await page.evaluate(() => window.__sprMeasure('/__base__/assets/warrior_walk.png', 96, 6, 3))
      .catch(e => ({ err: String(e && e.message || e), frames: [] }));
    check('(N4.1) 差替前の warrior_walk.png を配信できている (対照群が空振りでない)',
      !headWarrior.err && headWarrior.w === 576, JSON.stringify({ w: headWarrior.w, err: headWarrior.err }));
    check('(N4.2) 正規シートは HEAD と画素シグネチャが全コマ一致 = 主人公は巻き添えになっていない',
      !!headWarrior.frames && headWarrior.frames.length === 6 &&
      headWarrior.frames.every((f, i) => f && measured['warrior_walk.png'].frames[i] &&
                                         f.sig === measured['warrior_walk.png'].frames[i].sig),
      JSON.stringify([headWarrior.frames && headWarrior.frames.map(f => f && f.sig),
                      measured['warrior_walk.png'].frames.map(f => f && f.sig)]));
    check('(N4.3) 正規シートの体高も HEAD と同値',
      headWarrior.frames && headWarrior.frames.filter(Boolean).length ? med(headWarrior) === ww : false,
      'HEAD=' + (headWarrior.frames && headWarrior.frames.filter(Boolean).length ? med(headWarrior) : -1) + ' NOW=' + ww);

    await page.close();
  }

  // ═══════════ tavern.html ═══════════
  {
    const page = await browser.newPage();
    page.on('pageerror', e => allPageErrors.push(String(e && e.message || e)));
    await page.goto(base + '/tavern.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof PARTY_PORTRAIT_SPRITES !== 'undefined', { timeout: 20000 });

    const port = await page.evaluate(() => {
      const lens = {};
      for (const k of Object.keys(PARTY_PORTRAIT_SPRITES)) lens[k] = PARTY_PORTRAIT_SPRITES[k].length;
      return {
        warrior: PARTY_PORTRAIT_SPRITES.warrior.slice(),
        rogue: PARTY_PORTRAIT_SPRITES.rogue.slice(),
        lens,
        vcount: (typeof VARIANT_COUNT !== 'undefined') ? VARIANT_COUNT.warrior : null,
      };
    });
    check('(G6.1) PARTY_PORTRAIT_SPRITES.warrior が 4 要素 (VARIANT_COUNT と整合)',
      port.warrior.length === 4 && port.vcount === 4, JSON.stringify([port.warrior.length, port.vcount]));
    check('(G6.2) 他 5 職の要素数 4 も維持 (回帰なし)',
      ['dwarf', 'cleric', 'mage', 'elf', 'rogue'].every(k => port.lens[k] === 4), JSON.stringify(port.lens));
    check('(G6.3) warrior[0] が warrior_walk.png (正規は無改変)',
      port.warrior[0] === 'assets/warrior_walk.png', port.warrior[0]);
    check('(G6.4) warrior[1..3] が warrior_npcfemale_walk.png を共有',
      port.warrior.slice(1).every(u => u === 'assets/warrior_npcfemale_walk.png'),
      JSON.stringify(port.warrior.slice(1)));
    check('(G6.5) ポートレートは ?v= を付けない (明文ルール)',
      port.warrior.every(u => !/\?/.test(u)), JSON.stringify(port.warrior));
    check('(G6.6) 直前の差替 (盗賊) が回帰していない',
      port.rogue[0] === 'assets/rogue_walk.png'
        && port.rogue.slice(1).every(u => u === 'assets/rogue_male_walk.png'), JSON.stringify(port.rogue));
    const loaded = await page.evaluate(async (urls) => {
      const r = [];
      for (const u of urls) {
        r.push(await new Promise(res => {
          const i = new Image();
          i.onload = () => res({ u, ok: i.naturalWidth === 576 && i.naturalHeight === 384 });
          i.onerror = () => res({ u, ok: false });
          i.src = '/' + u;
        }));
      }
      return r;
    }, port.warrior);
    check('(G6.7) warrior のポートレート 4 URL がすべて 200 かつ 576x384',
      loaded.every(x => x.ok), JSON.stringify(loaded));

    // ── N3 負のコントロール (差替前の tavern) ────────────────
    const headTav = baseBytes('tavern.html');
    const headLine = headTav ? String(headTav).split('\n').find(l => /warrior:\s*\["assets\/warrior_walk/.test(l)) : null;
    check('(N3.1) 差替前の tavern.html を取得できている', !!headLine, headTav ? '(warrior 行なし)' : '(git show 失敗)');
    check('(N3.2) 差替前の warrior ポートレートは旧 chibi を指す (差分が実在する)',
      !!headLine && /warrior_heavy_walk\.png/.test(headLine) && /warrior_knight_walk\.png/.test(headLine),
      (headLine || '').trim().slice(0, 140));
    check('(N3.3) 作業ツリーでは旧 chibi 参照が消えている',
      !port.warrior.some(u => /warrior_(heavy|female|knight)_/.test(u)), JSON.stringify(port.warrior));

    await page.close();
  }

  await browser.close();
  srv.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}

  const realErrs = allPageErrors.filter(m => !/Failed to load resource|favicon|decodeAudioData|Unable to decode/i.test(m));
  check('(Z) pageerror ゼロ', realErrs.length === 0, realErrs.slice(0, 3).join(' | '));

  const passed = results.filter(r => r.ok).length;
  const total  = results.length;
  console.log('\n[driver] ROOT=' + ROOT);
  console.log('[driver] RESULT: ' + passed + '/' + total + ' passed');
  if (passed !== total) console.log('[driver] FAILED: ' + results.filter(r => !r.ok).map(r => r.name).join(' | '));
  process.exit(passed === total ? 0 : 1);
})().catch(e => { console.error('[driver] FATAL', e); process.exit(3); });
