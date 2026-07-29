#!/usr/bin/env node
/*
 * driver_rogue_sprites.js — 盗賊スプライト codex1 差替 (female-thief / male-thief) 検証ドライバ
 *
 *   node tools/driver_rogue_sprites.js [--headful] [--browser <path>] [--port N]
 *
 * 対象は index.html + tavern.html。2026-07-29 の差替内容:
 *   - 正規 (変種 index 0)  assets/rogue_{walk,attack}.png      <- codex1 female-thief (上書き)
 *   - 変種 index 1-3 共有  assets/rogue_male_{walk,attack}.png <- codex1 male-thief   (新規)
 *
 *   G1  配線: SPRITE_VARIANTS.rogue / getSpriteSet が期待 URL を返す (変種 1-3 は同一 1 枚)
 *   G2  実体: 4 枚の PNG が 200 で読め、規格サイズ (walk 576x384 / attack 480x384) である
 *   G3  体高パリティ: 画面上の体高が主人公戦士と同値。walk<->attack の変動が閾値内
 *   G4  重複コマ: row3 の全コマが互いに異なる (サイズ検査を素通りする軸)
 *   G5  当たり判定不変: displaySize 据置
 *   G6  tavern: PARTY_PORTRAIT_SPRITES.rogue が 4 要素で全部 200
 *
 * ⚠️ 本ドライバの肝は **同一 run に内包した負のコントロール** (N1-N3)。
 *    `/__head__/<path>` ルートで `git show HEAD:<path>` の生バイトを同時配信し、
 *    「HEAD の rogue_walk.png は体高 60px 超の chibi」「HEAD に rogue_male_walk.png は無い」
 *    「HEAD の tavern は rogue_assassin_walk.png を指す」を *正の assert* として測る。
 *    baseline が PASS するだけでは空振り (作業ツリーを 2 回測る事故) を検出できない。
 *    同名上書きの差替では `?v=` を見るだけでは「本当に置き換わったか」を証明できない。
 *
 * ⚠️ SPRITE_VARIANTS / getSpriteSet / CLASS_DEFS は classic script 直下の const/function
 *    なので window に載らない。page.evaluate の中から **bare 名** で読む
 *    (グローバル字句環境はスコープチェーンで引ける。window.SPRITE_VARIANTS は undefined)。
 */
const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg  = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const PORT    = parseInt(arg('port', '8877'), 10);

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

// HEAD の生バイトを取り出す (存在しないパスは null)。差替が「本当に効いたか」を測る唯一の手段。
function headBytes(rel) {
  try {
    return execFileSync('git', ['show', 'HEAD:' + rel.replace(/\\/g, '/')],
                        { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
  } catch (e) { return null; }
}

function startServer() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        if (u.startsWith('/__head__/')) {
          const rel = u.slice('/__head__/'.length);
          const buf = headBytes(rel);
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
    let sig = 0;
    for (let y = 0; y < cell; y++) {
      for (let x = 0; x < cell; x++) {
        const o = (y * cell + x) * 4;
        if (d[o + 3] > 64) { cnt[y]++; sig = (sig * 31 + (y * cell + x) + d[o] + d[o+1] * 3 + d[o+2] * 7) >>> 0; }
      }
    }
    const peak = Math.max.apply(null, cnt);
    if (peak <= 0) { out.frames.push(null); continue; }
    let top = 0; while (cnt[top] < peak * 0.25) top++;
    let bottom = cell - 1; while (cnt[bottom] === 0) bottom--;
    out.frames.push({ bodyH: bottom - top + 1, feet: bottom, sig: sig });
  }
  return out;
};
`;

(async () => {
  const puppeteer = loadPuppeteer();
  const srv = await startServer();
  const base = 'http://127.0.0.1:' + PORT;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'df_rogue_'));
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
      const out = { len: SPRITE_VARIANTS.rogue.length, sets: [] };
      for (let v = 0; v < 4; v++) {
        const s = getSpriteSet('rogue', v);
        out.sets.push({ walk: s.walk, attack: s.attack, ws: s.walkSize, as: s.attackSize, label: s.label });
      }
      out.player = (typeof LEADER_SPRITES !== 'undefined') ? LEADER_SPRITES.rogue : null;
      out.custom = (typeof CUSTOM_SHEET_CLASSES !== 'undefined') && CUSTOM_SHEET_CLASSES.has('rogue');
      out.wrap = getSpriteSet('rogue', 9).walk === getSpriteSet('rogue', 1).walk;
      return out;
    });
    check('(G1.1) SPRITE_VARIANTS.rogue が 4 変種のまま', wire.len === 4, wire.len);
    check('(G1.2) 変種 0 (正規) が rogue_walk.png を指す',
      /assets\/rogue_walk\.png/.test(wire.sets[0].walk), wire.sets[0].walk);
    check('(G1.3) 変種 0 の walk に ?v=3 が付く (同名上書きのキャッシュ破棄)',
      /rogue_walk\.png\?v=3/.test(wire.sets[0].walk), wire.sets[0].walk);
    check('(G1.4) 変種 0 の attack に ?v=3 が付く',
      /rogue_attack\.png\?v=3/.test(wire.sets[0].attack), wire.sets[0].attack);
    check('(G1.5) 変種 1-3 が rogue_male_walk.png を共有',
      [1, 2, 3].every(v => /assets\/rogue_male_walk\.png/.test(wire.sets[v].walk)),
      JSON.stringify(wire.sets.slice(1).map(s => s.walk)));
    check('(G1.6) 変種 1-3 が rogue_male_attack.png を共有',
      [1, 2, 3].every(v => /assets\/rogue_male_attack\.png/.test(wire.sets[v].attack)),
      JSON.stringify(wire.sets.slice(1).map(s => s.attack)));
    check('(G1.7) 変種 1-3 に旧 chibi (assassin/acrobat/scout) が残っていない',
      [1, 2, 3].every(v => !/rogue_(assassin|acrobat|scout)/.test(wire.sets[v].walk + wire.sets[v].attack)),
      JSON.stringify(wire.sets.slice(1)));
    check('(G1.8) label は 3 種のまま (内部識別子は温存)',
      wire.sets[1].label === 'アサシン' && wire.sets[2].label === '軽業師' && wire.sets[3].label === '影の斥候',
      JSON.stringify(wire.sets.map(s => s.label)));
    check('(G1.9) 全変種のシート寸法指定が規格どおり',
      wire.sets.every(s => s.ws === '576px 384px' && s.as === '480px 384px'),
      JSON.stringify(wire.sets.map(s => [s.ws, s.as])));
    check('(G1.10) 主人公用 LEADER_SPRITES.rogue も ?v=3 へ更新済み',
      wire.player && /rogue_walk\.png\?v=3/.test(wire.player.walk) && /rogue_attack\.png\?v=3/.test(wire.player.attack),
      JSON.stringify(wire.player));
    check('(G1.11) rogue は専用シートクラスのまま', wire.custom === true, wire.custom);
    check('(G1.12) 範囲外 index は剰余で丸まる (getSpriteSet の既存契約)', wire.wrap === true, wire.wrap);

    // ── G2 実体 (404 なし / 規格サイズ) ─────────────────────
    const sheets = [
      ['rogue_walk.png?v=3',    WALK_SIZE, 6],
      ['rogue_attack.png?v=3',  ATK_SIZE,  5],
      ['rogue_male_walk.png',   WALK_SIZE, 6],
      ['rogue_male_attack.png', ATK_SIZE,  5],
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
    const warriorW = await page.evaluate(() => window.__sprMeasure('/assets/warrior_walk.png', 96, 6, 3));
    const rw  = med(measured['rogue_walk.png']);
    const ra  = med(measured['rogue_attack.png']);
    const rmw = med(measured['rogue_male_walk.png']);
    const rma = med(measured['rogue_male_attack.png']);
    const ww  = med(warriorW);
    check('(G3.1) 主人公戦士の体高を実測できている (56px 前後)', ww >= 50 && ww <= 62, ww);
    check('(G3.2) 盗賊 正規の体高が主人公戦士と同値', rw === ww, 'rogue=' + rw + ' warrior=' + ww);
    check('(G3.3) 盗賊 変種の体高も主人公戦士と同値', rmw === ww, 'rogue_male=' + rmw + ' warrior=' + ww);
    check('(G3.4) 正規: walk->attack の体高変動が ±5% 以内',
      Math.abs((ra - rw) / rw) < 0.05, ((ra - rw) / rw * 100).toFixed(2) + '%');
    check('(G3.5) 変種: walk->attack の体高変動が ±5% 以内',
      Math.abs((rma - rmw) / rmw) < 0.05, ((rma - rmw) / rmw * 100).toFixed(2) + '%');
    check('(G3.6) 正規: walk と attack の接地線が一致 (足が浮かない/沈まない)',
      Math.abs(Math.max.apply(null, feetOf(measured['rogue_walk.png'])) -
               Math.max.apply(null, feetOf(measured['rogue_attack.png']))) <= 1,
      JSON.stringify([feetOf(measured['rogue_walk.png']), feetOf(measured['rogue_attack.png'])]));
    check('(G3.7) 変種: walk と attack の接地線が一致',
      Math.abs(Math.max.apply(null, feetOf(measured['rogue_male_walk.png'])) -
               Math.max.apply(null, feetOf(measured['rogue_male_attack.png']))) <= 1,
      JSON.stringify([feetOf(measured['rogue_male_walk.png']), feetOf(measured['rogue_male_attack.png'])]));
    check('(G3.8) 全コマがセル内に収まる (足元がセル底を突き抜けない)',
      Object.values(measured).every(m => m.frames.filter(Boolean).every(f => f.feet <= 95)),
      JSON.stringify(Object.entries(measured).map(([k, m]) => [k, Math.max.apply(null, feetOf(m))])));

    // ── G4 重複コマ ─────────────────────────────────────────
    for (const key of Object.keys(measured)) {
      const sigs = measured[key].frames.filter(Boolean).map(f => f.sig);
      check('(G4) ' + key + ' の row3 に重複コマなし',
        sigs.length > 0 && new Set(sigs).size === sigs.length, JSON.stringify(sigs));
    }

    // ── G5 当たり判定不変 ───────────────────────────────────
    const hit = await page.evaluate(() => ({
      disp: (typeof CLASS_DEFS !== 'undefined') ? CLASS_DEFS.rogue.displaySize : null,
      sprite: (typeof CLASS_DEFS !== 'undefined') ? CLASS_DEFS.rogue.sprite : null,
    }));
    check('(G5.1) CLASS_DEFS.rogue.displaySize が 96 据置 (当たり判定不変)', hit.disp === 96, hit.disp);
    check('(G5.2) CLASS_DEFS.rogue.sprite も ?v=3 へ更新済み',
      /rogue_walk\.png\?v=3/.test(hit.sprite || ''), hit.sprite);

    // ── N1-N2 負のコントロール (HEAD の生バイトと比較) ──────
    const headWalk = await page.evaluate(() => window.__sprMeasure('/__head__/assets/rogue_walk.png', 96, 6, 3))
      .catch(e => ({ err: String(e && e.message || e), frames: [] }));
    check('(N1.1) HEAD の rogue_walk.png を配信できている (負のコントロールが空振りでない)',
      !headWalk.err && headWalk.w === 576, JSON.stringify({ w: headWalk.w, err: headWalk.err }));
    const headMed = (headWalk.frames && headWalk.frames.filter(Boolean).length) ? med(headWalk) : -1;
    check('(N1.2) HEAD の体高は 60px 超の chibi = 実際に差し替わっている',
      headMed > 60, 'HEAD=' + headMed + ' NEW=' + rw);
    check('(N1.3) HEAD と作業ツリーで体高が違う (同じ絵を 2 回測っていない)',
      headMed !== rw, 'HEAD=' + headMed + ' NEW=' + rw);
    check('(N1.4) HEAD と作業ツリーで 1 コマ目の画素シグネチャが違う (バイト差の直接証明)',
      !!(headWalk.frames && headWalk.frames[0] && measured['rogue_walk.png'].frames[0] &&
         headWalk.frames[0].sig !== measured['rogue_walk.png'].frames[0].sig),
      headWalk.frames && headWalk.frames[0] && (headWalk.frames[0].sig + ' vs ' + measured['rogue_walk.png'].frames[0].sig));
    const headMale = await page.evaluate(async () => {
      try { await window.__sprMeasure('/__head__/assets/rogue_male_walk.png', 96, 6, 3); return 'loaded'; }
      catch (e) { return 'missing'; }
    });
    check('(N2) HEAD に rogue_male_walk.png は存在しない (新規追加である証明)',
      headMale === 'missing', headMale);

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
        rogue: PARTY_PORTRAIT_SPRITES.rogue.slice(),
        lens,
        vcount: (typeof VARIANT_COUNT !== 'undefined') ? VARIANT_COUNT.rogue : null,
      };
    });
    check('(G6.1) PARTY_PORTRAIT_SPRITES.rogue が 4 要素 (VARIANT_COUNT と整合)',
      port.rogue.length === 4 && port.vcount === 4, JSON.stringify([port.rogue.length, port.vcount]));
    check('(G6.2) 他 5 職の要素数 4 も維持 (回帰なし)',
      ['warrior', 'dwarf', 'cleric', 'mage', 'elf'].every(k => port.lens[k] === 4), JSON.stringify(port.lens));
    check('(G6.3) rogue[0] が rogue_walk.png', port.rogue[0] === 'assets/rogue_walk.png', port.rogue[0]);
    check('(G6.4) rogue[1..3] が rogue_male_walk.png を共有',
      port.rogue.slice(1).every(u => u === 'assets/rogue_male_walk.png'), JSON.stringify(port.rogue.slice(1)));
    check('(G6.5) ポートレートは ?v= を付けない (明文ルール)',
      port.rogue.every(u => !/\?/.test(u)), JSON.stringify(port.rogue));
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
    }, port.rogue);
    check('(G6.6) rogue のポートレート 4 URL がすべて 200 かつ 576x384',
      loaded.every(x => x.ok), JSON.stringify(loaded));

    // ── N3 負のコントロール (HEAD の tavern) ────────────────
    const headTav = headBytes('tavern.html');
    const headLine = headTav ? String(headTav).split('\n').find(l => /rogue:\s*\[/.test(l)) : null;
    check('(N3.1) HEAD の tavern.html を取得できている', !!headLine, headTav ? '(rogue 行なし)' : '(git show 失敗)');
    check('(N3.2) HEAD の rogue ポートレートは旧 chibi を指す (差分が実在する)',
      !!headLine && /rogue_assassin_walk\.png/.test(headLine), (headLine || '').trim().slice(0, 120));
    check('(N3.3) 作業ツリーでは旧 chibi 参照が消えている',
      !port.rogue.some(u => /rogue_(assassin|acrobat|scout)/.test(u)), JSON.stringify(port.rogue));

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
