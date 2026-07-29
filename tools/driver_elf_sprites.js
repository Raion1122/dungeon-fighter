#!/usr/bin/env node
/*
 * driver_elf_sprites.js — エルフ 4 種の codex1 差替 (female-elf / elf) 検証ドライバ
 *
 *   node tools/driver_elf_sprites.js [--headful] [--browser <path>] [--port N] [--root <dir>]
 *
 * 対象は index.html + tavern.html。エルフは **味方 NPC 6 職で最後まで chibi のまま残っていた職**。
 *
 * 2026-07-30 の差替:
 *   - 正規 (変種 index 0)  assets/elf_{walk,attack}.png       <- codex1 female-elf (**同名上書き** = ?v= bump 必須)
 *   - 変種 index 1-3 共有  assets/elf_male_{walk,attack}.png  <- codex1 elf (男エルフ / 新規ファイル名 = ?v= 不要)
 *
 * ⚠️⚠️ この差替の背景 = **codex1 の elf/ と female-elf/ の既存素材は「長剣＋ラウンドシールドの剣士」**で、
 *    ゲームのエルフ (弓職: ボールト classes.md『武器: 弓+短剣』/ 呪文が全部矢系 / 変種名が射手・女狩人・
 *    影射手 / 旧 chibi も walk から弓を手に持つ) と食い違っていた。依頼文
 *    requests/2026-07-30_elf-bow-motions.md で **bow 系を新規に描いてもらった**のが今回の素材。
 *    → so **G6.3 で台帳の glob に `bow-` が入っていることを静的に assert する** (剣士素材を指す事故の再発防止)。
 *
 *   G1  配線: SPRITE_VARIANTS.elf / getSpriteSet が期待 URL を返す (変種 1-3 は同一 1 枚)
 *   G2  実体: 4 枚が 200 で読め、規格サイズ (walk 576x384 / attack 480x384) である
 *   G3  体高パリティ: 画面上の体高が主人公戦士と ±1px。walk<->attack の変動が閾値内。接地線が揃う
 *   G4  重複コマ: row3 の全コマが互いに異なる (サイズ検査を素通りする軸)
 *   G5  当たり判定不変: CLASS_DEFS.elf の displaySize / sprite / weaponProjectile
 *   G6  ⭐ **弓であることの機械的証明**: attack の右端が walk より前へ出る + 台帳 glob に `bow-`
 *   G7  tavern: PARTY_PORTRAIT_SPRITES.elf が 4 要素で全部 200
 *   G8  統合: updateAllySprite が変種ごとに正しいシートを実際に適用する
 *
 * ⚠️ 本ドライバの肝は **同一 run に内包した負のコントロール** (N1-N7)。
 *    `/__head__/<path>` ルートで `git show HEAD:<path>` の生バイトを同時配信し、HEAD と作業ツリーを
 *    同じ物差しで測る。baseline が PASS するだけでは空振り (作業ツリーを 2 回測る事故) を検出できない。
 *
 * ⚠️⚠️ N ブロックは **今回の差分に合わせて書いてある**。差替のたびに自己失効する (HEAD が本コミットを
 *    含んだ瞬間に N1-N6 は測れなくなる) ので、次にエルフを触るときは必ず書き直すこと。現行の向き:
 *      N1 = 「正規 2 枚は HEAD と画素が *相違*」 = 差替が本当に効いた証明 (?v= だけでは足りない)
 *      N2 = 「HEAD では正規エルフの体高が戦士より 5px 大きかった (61 vs 56)」= 体高を揃えた証明
 *      N3 = 「HEAD では正規エルフの接地線が 2 値 (90/91) にぶれていた」= 整列した証明
 *      N4 = 「HEAD の index.html は walk が ?v=2 / attack が ?v=3 / **LEADER_SPRITES.elf は素パス**」
 *           = bump と、6 職で elf だけ ?v= が抜けていた取り残しを直した証明
 *      N5 = 「HEAD の変種 1-3 は elf_{high,huntress,shadow} を指していた」= 旧 chibi 参照の実在証明
 *      N6 = 「HEAD の tavern.html の elf 行も旧 chibi 3 種だった」= ポートレート同期の差分が実在
 *      N7 = 「戦士シートは HEAD と画素が *一致する*」= 台帳 --all 再パックの巻き添えが無い証明
 *    「変えた」と「変えていない」の両方を正の assert として測る。
 *
 * ⚠️ SPRITE_VARIANTS / getSpriteSet / CLASS_DEFS / LEADER_SPRITES / updateAllySprite は
 *    classic script 直下の const/function なので window に載らない。page.evaluate の中から
 *    **bare 名** で読む (グローバル字句環境はスコープチェーンで引ける)。
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
const PORT    = parseInt(arg('port', '8887'), 10);

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
//          頭頂と誤認しない — 弓の上端・矢羽根を身長に数えないためにこれが必須) /
//          bottom = 不透明が 1 個でもある最下行。
//   sig  : セルの画素シグネチャ。重複コマ検出と HEAD 比較の両方に使う。
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'df_elf_'));
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: !HEADFUL, userDataDir: profile,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
  });
  const allPageErrors = [];

  const WALK_SIZE = { w: 576, h: 384 }, ATK_SIZE = { w: 480, h: 384 };
  const med = (m) => {
    const xs = m.frames.filter(Boolean).map(f => f.bodyH).sort((a, b) => a - b);
    if (!xs.length) return -1;
    return xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2;
  };
  const feetSet  = (m) => Array.from(new Set(m.frames.filter(Boolean).map(f => f.feet))).sort((a, b) => a - b);
  const maxFeet  = (m) => Math.max.apply(null, m.frames.filter(Boolean).map(f => f.feet));
  const maxX1    = (m) => Math.max.apply(null, m.frames.filter(Boolean).map(f => f.x1));

  // 作業ツリーの生テキスト (?v= の取り残し検査に使う。page 内から読むより確実)
  const wtIdx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

  // ═══════════ index.html ═══════════
  {
    const page = await browser.newPage();
    page.on('pageerror', e => allPageErrors.push(String(e && e.message || e)));
    await page.evaluateOnNewDocument(PAGE_HELPERS);
    await page.goto(base + '/index.html?autoplay=1&intel=0', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof SPRITE_VARIANTS !== 'undefined', { timeout: 20000 });

    // ── G1 配線 ─────────────────────────────────────────────
    const wire = await page.evaluate(() => {
      const out = { len: SPRITE_VARIANTS.elf.length, sets: [] };
      for (let v = 0; v < 4; v++) {
        const s = getSpriteSet('elf', v);
        out.sets.push({ walk: s.walk, attack: s.attack, cast: s.cast || null,
                        ws: s.walkSize, as: s.attackSize, label: s.label });
      }
      out.player = (typeof LEADER_SPRITES !== 'undefined') ? LEADER_SPRITES.elf : null;
      out.custom = (typeof CUSTOM_SHEET_CLASSES !== 'undefined') && CUSTOM_SHEET_CLASSES.has('elf');
      out.castCls = (typeof CAST_SHEET_CLASSES !== 'undefined') && CAST_SHEET_CLASSES.has('elf');
      out.wrap = getSpriteSet('elf', 9).walk === getSpriteSet('elf', 1).walk;
      return out;
    });
    check('(G1.1) SPRITE_VARIANTS.elf が 4 変種のまま', wire.len === 4, wire.len);
    check('(G1.2) 変種 0 (正規) の walk = elf_walk.png?v=3 (同名上書きなので ?v= bump 必須)',
      /assets\/elf_walk\.png\?v=3/.test(wire.sets[0].walk), wire.sets[0].walk);
    check('(G1.3) 変種 0 の attack = elf_attack.png?v=4',
      /assets\/elf_attack\.png\?v=4/.test(wire.sets[0].attack), wire.sets[0].attack);
    check('(G1.4) 変種 1-3 が elf_male_walk.png を共有',
      [1, 2, 3].every(v => /assets\/elf_male_walk\.png/.test(wire.sets[v].walk)),
      JSON.stringify(wire.sets.slice(1).map(s => s.walk)));
    check('(G1.5) 変種 1-3 が elf_male_attack.png を共有',
      [1, 2, 3].every(v => /assets\/elf_male_attack\.png/.test(wire.sets[v].attack)),
      JSON.stringify(wire.sets.slice(1).map(s => s.attack)));
    // ⚠ ?v= は「同名上書きの時だけ」付ける。機械的に全部へ付けるものではない。
    check('(G1.6) 変種 1-3 には ?v= を付けていない (新規ファイル名なので不要)',
      [1, 2, 3].every(v => !/elf_male_(walk|attack)\.png\?/.test(wire.sets[v].walk + wire.sets[v].attack)),
      JSON.stringify(wire.sets.slice(1).map(s => [s.walk, s.attack])));
    check('(G1.7) 変種 1-3 に旧 chibi (high/huntress/shadow) が残っていない',
      [1, 2, 3].every(v => !/elf_(high|huntress|shadow)_/.test(wire.sets[v].walk + wire.sets[v].attack)),
      JSON.stringify(wire.sets.slice(1)));
    check('(G1.8) label は 3 種のまま (内部識別子は温存)',
      wire.sets[1].label === 'ハイエルフの射手' && wire.sets[2].label === '森の女狩人'
        && wire.sets[3].label === '闇森の影射手',
      JSON.stringify(wire.sets.map(s => s.label)));
    check('(G1.9) 全変種のシート寸法指定が規格どおり (walk 576x384, attack 480x384)',
      wire.sets.every(s => s.ws === '576px 384px' && s.as === '480px 384px'),
      JSON.stringify(wire.sets.map(s => [s.ws, s.as])));
    // ⭐ ここが今回の隠れバグ。2026-07-30 まで LEADER_SPRITES.elf だけ ?v= が無く (他 5 職は有り)、
    //    同名上書きした瞬間に「主人公がエルフのときだけ旧 chibi がキャッシュから出る」状態だった。
    check('(G1.10) ⭐ 主人公用 LEADER_SPRITES.elf も ?v=3 / ?v=4 へ揃っている (6 職で elf だけ抜けていた取り残し)',
      !!wire.player && /elf_walk\.png\?v=3/.test(wire.player.walk)
        && /elf_attack\.png\?v=4/.test(wire.player.attack),
      JSON.stringify(wire.player));
    check('(G1.11) elf は専用シートクラスのまま', wire.custom === true, wire.custom);
    check('(G1.12) elf は cast シートクラスでは **ない** (cast を持つのは僧侶だけ)',
      wire.castCls === false, wire.castCls);
    check('(G1.13) 範囲外 index は剰余で丸まる (getSpriteSet の既存契約)', wire.wrap === true, wire.wrap);
    // ⭐ エルフだけは男女 2 デザインある。同じ絵を 2 回パックしていないことを URL レベルで確かめる。
    check('(G1.14) ⭐ 変種 0 と変種 1-3 が別シート (男女 2 デザイン = 他 5 職より 1 種多い)',
      wire.sets[0].walk !== wire.sets[1].walk && wire.sets[0].attack !== wire.sets[1].attack,
      JSON.stringify([wire.sets[0].walk, wire.sets[1].walk]));
    check('(G1.15) 変種 0-3 いずれも cast を持たない (僧侶用フィールドが混入していない)',
      wire.sets.every(s => !s.cast), JSON.stringify(wire.sets.map(s => s.cast)));

    // ── G2 実体 (404 なし / 規格サイズ) ─────────────────────
    const sheets = [
      ['elf_walk.png?v=3',        WALK_SIZE, 6],
      ['elf_attack.png?v=4',      ATK_SIZE,  5],
      ['elf_male_walk.png',       WALK_SIZE, 6],
      ['elf_male_attack.png',     ATK_SIZE,  5],
      ['warrior_walk.png?v=8',    WALK_SIZE, 6],
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

    const elfKeys = ['elf_walk.png', 'elf_attack.png', 'elf_male_walk.png', 'elf_male_attack.png'];

    // ── G3 体高パリティ / 接地 ──────────────────────────────
    const ww = med(measured['warrior_walk.png']);
    const fw = med(measured['elf_walk.png']);
    const fa = med(measured['elf_attack.png']);
    const mw = med(measured['elf_male_walk.png']);
    const ma = med(measured['elf_male_attack.png']);
    check('(G3.1) 主人公戦士の体高を実測できている (56px 前後)', ww >= 50 && ww <= 62, ww);
    // ⚠ 「完全同値」ではなく ±1px。char_ratio の逆算は整数丸めが入るので 1px はどうしても出る。
    //    HEAD の旧 chibi は 61px = 戦士より 5px 大きく、明確に浮いていた (N2 で測る)。
    check('(G3.2) 正規エルフ (女) の walk 体高が主人公戦士と ±1px', Math.abs(fw - ww) <= 1,
      'elf=' + fw + ' warrior=' + ww);
    check('(G3.3) 変種エルフ (男) の walk 体高も主人公戦士と ±1px', Math.abs(mw - ww) <= 1,
      'elf_male=' + mw + ' warrior=' + ww);
    check('(G3.4) 正規: walk->attack の体高変動が ±5% 以内',
      Math.abs((fa - fw) / fw) < 0.05, ((fa - fw) / fw * 100).toFixed(2) + '%');
    check('(G3.5) 変種: walk->attack の体高変動が ±5% 以内',
      Math.abs((ma - mw) / mw) < 0.05, ((ma - mw) / mw * 100).toFixed(2) + '%');
    for (const [tag, w, a] of [['正規', 'elf_walk.png', 'elf_attack.png'],
                               ['変種', 'elf_male_walk.png', 'elf_male_attack.png']]) {
      check('(G3.6) ' + tag + ': walk / attack の接地線が一致 (足が浮かない/沈まない)',
        Math.abs(maxFeet(measured[w]) - maxFeet(measured[a])) <= 1,
        JSON.stringify([maxFeet(measured[w]), maxFeet(measured[a])]));
    }
    // ⭐ HEAD の旧 chibi は 1 シート内で接地線が 2-3 値にぶれていた (N3 で測る)。整列済み素材の要件。
    for (const key of elfKeys) {
      const fset = feetSet(measured[key]);
      check('(G3.7) ⭐ ' + key + ' のシート内 接地線ぶれが 1px 以内 (整列済み素材)',
        fset.length > 0 && (fset[fset.length - 1] - fset[0]) <= 1, JSON.stringify(fset));
    }
    check('(G3.8) 全コマがセル内に収まる (足元がセル底を突き抜けない)',
      Object.values(measured).every(m => m.frames.filter(Boolean).every(f => f.feet <= 95)),
      JSON.stringify(Object.entries(measured).map(([k, m]) => [k, maxFeet(m)])));
    const xspan = elfKeys.map(k => measured[k].frames.filter(Boolean).map(f => [f.x0, f.x1]));
    check('(G3.9) エルフ 4 シートともセル右端で切れていない (x1 <= 95 / 弓と矢は前方へ長い)',
      xspan.every(fr => fr.every(([, x1]) => x1 <= 95)), JSON.stringify(xspan));
    check('(G3.10) エルフ 4 シートともセル左端で切れていない (x0 >= 1)',
      xspan.every(fr => fr.every(([x0]) => x0 >= 1)), JSON.stringify(xspan));

    // ── G4 重複コマ ─────────────────────────────────────────
    for (const key of elfKeys) {
      const sigs = measured[key].frames.filter(Boolean).map(f => f.sig);
      check('(G4) ' + key + ' の row3 に重複コマなし',
        sigs.length > 0 && new Set(sigs).size === sigs.length, JSON.stringify(sigs));
    }

    // ── G5 当たり判定不変 ───────────────────────────────────
    const hit = await page.evaluate(() => ({
      disp: (typeof CLASS_DEFS !== 'undefined') ? CLASS_DEFS.elf.displaySize : null,
      sprite: (typeof CLASS_DEFS !== 'undefined') ? CLASS_DEFS.elf.sprite : null,
      proj: (typeof CLASS_DEFS !== 'undefined') ? CLASS_DEFS.elf.weaponProjectile : null,
      wdisp: (typeof CLASS_DEFS !== 'undefined') ? CLASS_DEFS.warrior.displaySize : null,
    }));
    check('(G5.1) CLASS_DEFS.elf.displaySize が 96 据置 (当たり判定不変)', hit.disp === 96, hit.disp);
    check('(G5.2) CLASS_DEFS.elf.sprite も ?v=3 へ bump 済み (取り残しなし)',
      /elf_walk\.png\?v=3/.test(hit.sprite || ''), hit.sprite);
    check('(G5.3) ⭐ CLASS_DEFS.elf.weaponProjectile が "arrow" 据置 (弓職の定義に手を入れていない)',
      hit.proj === 'arrow', hit.proj);
    check('(G5.4) 戦士の displaySize も 96 のまま (回帰なし)', hit.wdisp === 96, hit.wdisp);

    // ── G6 ⭐ 「弓である」ことの機械的証明 ───────────────────
    // (a) 弓を引き絞って射出するモーションでは、弓の本体と矢が **前方 (右) へ張り出す**。
    //     弓を体側に下げて歩く walk より attack の右端が必ず外側へ出る。
    //     ⚠ 「弓が描かれている」を直接判定する手段は無いので、前方リーチの増加を代理指標にする。
    //        剣の突き (旧 elf/ の剣士素材) でも増えるため単独では弓の証明にならないが、
    //        目視 (qa シート) + (b) の台帳検査と併せて「剣士素材を掴んでいない」ことを担保する。
    for (const [tag, w, a] of [['正規', 'elf_walk.png', 'elf_attack.png'],
                               ['変種', 'elf_male_walk.png', 'elf_male_attack.png']]) {
      check('(G6.1) ' + tag + ': attack の前方リーチが walk より大きい (弓/矢が前へ出る)',
        maxX1(measured[a]) > maxX1(measured[w]),
        'walk_x1=' + maxX1(measured[w]) + ' attack_x1=' + maxX1(measured[a]));
    }
    // (b) ⭐⭐ 台帳が **bow 素材** を指していることの静的検査。
    //     2026-07-30 の事故 = codex1 の elf/ と female-elf/ 直下の walk/attack は「長剣＋盾の剣士」で、
    //     フォルダ名だけでは中身が判別できなかった。glob に `bow-` を強制することで、
    //     将来 --all を回したときに剣士素材へ戻る事故を機械的に止める。
    const ledger = await page.evaluate(async () => {
      const r = await fetch('/tools/codex1_sprites.json');
      if (!r.ok) return { err: 'HTTP ' + r.status };
      const j = await r.json();
      const pick = (k) => (j.sheets || []).find(e => e.key === k) || null;
      const e1 = pick('elf'), e2 = pick('female-elf');
      return { elf: e1 && { out: e1.out, atk: e1.attack_out, w: e1.walk_dir, a: e1.attack_dir, cr: e1.char_ratio, as: e1.attack_scale },
               fem: e2 && { out: e2.out, atk: e2.attack_out, w: e2.walk_dir, a: e2.attack_dir, cr: e2.char_ratio, as: e2.attack_scale } };
    });
    check('(G6.2) 台帳 tools/codex1_sprites.json を読めている', !ledger.err && !!ledger.elf && !!ledger.fem,
      JSON.stringify(ledger).slice(0, 200));
    check('(G6.3) ⭐⭐ 台帳の elf / female-elf の walk_dir・attack_dir が **すべて `bow-` を含む** (剣士素材を掴む事故の再発防止)',
      !!ledger.elf && !!ledger.fem &&
      [ledger.elf.w, ledger.elf.a, ledger.fem.w, ledger.fem.a].every(g => typeof g === 'string' && g.includes('bow-')),
      JSON.stringify([ledger.elf && [ledger.elf.w, ledger.elf.a], ledger.fem && [ledger.fem.w, ledger.fem.a]]));
    check('(G6.4) 台帳の出力先が入れ替わっている (標準=女エルフ / 変種=男エルフ)',
      !!ledger.fem && ledger.fem.out === 'assets/elf_walk.png' && ledger.fem.atk === 'assets/elf_attack.png' &&
      !!ledger.elf && ledger.elf.out === 'assets/elf_male_walk.png' && ledger.elf.atk === 'assets/elf_male_attack.png',
      JSON.stringify([ledger.elf && ledger.elf.out, ledger.fem && ledger.fem.out]));
    // ⚠ attack_scale="auto" は素材ごとに試し打ちして決めるもの。エルフは前傾で体高が縮むのが
    //    「演技として正しい」縮みなので補正しない = 1.0 を明示。auto に戻すと弓を引く姿が膨らむ。
    check('(G6.5) 台帳の attack_scale が両エントリとも 1.0 (auto にしない)',
      !!ledger.elf && ledger.elf.as === 1 && !!ledger.fem && ledger.fem.as === 1,
      JSON.stringify([ledger.elf && ledger.elf.as, ledger.fem && ledger.fem.as]));

    // ── G8 統合: updateAllySprite が実際に適用するシート ────
    // 配線 (G1) だけでは「getSpriteSet は正しいが描画側が拾っていない」事故を検出できない。
    const applied = await page.evaluate(() => {
      const out = { err: null, urls: [] };
      try {
        for (let v = 0; v < 4; v++) {
          const el = document.createElement('div');
          el.style.position = 'absolute'; el.style.left = '-9999px';
          document.body.appendChild(el);
          const ally = {
            el, classKey: 'elf', variant: v, facing: 'right',
            animTick: 0, _animFrameId: -1, playerMovingThisFrame: false,
            x: 0, y: 0, hp: 10, hpMax: 10,
          };
          updateAllySprite(ally);
          out.urls.push(el.style.backgroundImage);
          el.remove();
        }
      } catch (e) { out.err = String(e && e.message || e); }
      return out;
    });
    check('(G8.1) updateAllySprite を偽 ally で駆動できている', !applied.err, applied.err);
    check('(G8.2) 正規 (variant 0) に elf_walk.png が適用される',
      /elf_walk\.png/.test(applied.urls[0] || '') && !/elf_male_walk\.png/.test(applied.urls[0] || ''),
      applied.urls[0]);
    check('(G8.3) 変種 1-3 に elf_male_walk.png が適用される (正規へ化けない)',
      [1, 2, 3].every(v => /elf_male_walk\.png/.test(applied.urls[v] || '')),
      JSON.stringify(applied.urls.slice(1)));
    check('(G8.4) 正規と変種で実際に別 URL が出ている',
      !!applied.urls[0] && applied.urls[0] !== applied.urls[1],
      JSON.stringify([applied.urls[0], applied.urls[1]]));

    // ── N1 ⭐ 「変えた」ことの正の assert (正規は同名上書き) ──
    const headWalk = await page.evaluate(() => window.__sprMeasure('/__head__/assets/elf_walk.png', 96, 6, 3))
      .catch(e => ({ err: String(e && e.message || e), frames: [] }));
    const headAtk = await page.evaluate(() => window.__sprMeasure('/__head__/assets/elf_attack.png', 96, 5, 3))
      .catch(e => ({ err: String(e && e.message || e), frames: [] }));
    check('(N1.1) HEAD の elf_walk.png を配信できている (対照群が空振りでない)',
      !headWalk.err && headWalk.w === 576, JSON.stringify({ w: headWalk.w, err: headWalk.err }));
    check('(N1.2) HEAD の elf_attack.png を配信できている',
      !headAtk.err && headAtk.w === 480, JSON.stringify({ w: headAtk.w, err: headAtk.err }));
    for (const [tag, head, key, cols] of [['walk', headWalk, 'elf_walk.png', 6],
                                          ['attack', headAtk, 'elf_attack.png', 5]]) {
      check('(N1.3) ⭐ 正規 ' + tag + ' は HEAD と画素シグネチャが全コマ相違 = 差替が本当に効いている',
        !!head.frames && head.frames.length === cols &&
        head.frames.every((f, i) => f && measured[key].frames[i] && f.sig !== measured[key].frames[i].sig),
        JSON.stringify([head.frames && head.frames.map(f => f && f.sig),
                        measured[key].frames.map(f => f && f.sig)]));
    }

    // ── N2 ⭐ 体高を揃えたことの証明 ─────────────────────────
    // HEAD の旧 chibi は 61px = 戦士 (56px) より 5px 大きく、パーティで明確に浮いていた。
    // これが PASS して初めて「G3.2 の ±1px は実際に縮めた結果」と言える (assert を緩めただけではない)。
    const headWalkMed = med(headWalk);
    check('(N2) ⭐ HEAD では正規エルフの体高が戦士より 2px 以上大きかった (旧 chibi が浮いていた実在証明)',
      headWalkMed > 0 && (headWalkMed - ww) >= 2,
      'HEAD elf=' + headWalkMed + ' warrior=' + ww + ' / 作業ツリー elf=' + fw);

    // ── N3 ⭐ 変種 3 枠がバラバラだったことの証明 ────────────
    // HEAD は変種 1-3 に **別々の chibi 3 枚** (elf_high / elf_huntress / elf_shadow) を当てていたため、
    // 同じ「エルフ」なのに体高が 3 種で大きくばらついていた。作業ツリーは 1 枚共有なので構造的に同一。
    //
    // ⚠️⚠️ 教訓: ここは最初「HEAD のシート内 接地線が 2 値にぶれていた」で書いたが **FAIL した**。
    //    前提の 90/91 は Python 側 (`alpha>16`) で採った値で、本ドライバの物差しは `alpha>64`。
    //    同じ絵でも HEAD は feet=[90] の 1 値になる。**別の物差しで採った数値を負のコントロールの
    //    前提に使うな** — 必ずドライバ自身の metric で測った値を根拠にすること。
    const headVarMeds = [];
    for (const f of ['elf_high_walk.png', 'elf_huntress_walk.png', 'elf_shadow_walk.png']) {
      const m = await page.evaluate((u) => window.__sprMeasure(u, 96, 6, 3), '/__head__/assets/' + f)
        .catch(e => ({ err: String(e && e.message || e), frames: [] }));
      headVarMeds.push({ f, med: m.frames && m.frames.length ? med(m) : -1, err: m.err });
    }
    check('(N3.1) HEAD の旧 chibi 変種 3 枚を配信できている (対照群が空振りでない)',
      headVarMeds.every(x => x.med > 0), JSON.stringify(headVarMeds));
    const hvs = headVarMeds.map(x => x.med);
    check('(N3.2) ⭐ HEAD の変種 3 枠は体高が 2px 以上ばらついていた (別々の chibi 3 枚だった実在証明)',
      hvs.every(v => v > 0) && (Math.max.apply(null, hvs) - Math.min.apply(null, hvs)) >= 2,
      'HEAD 変種体高=' + JSON.stringify(headVarMeds.map(x => [x.f, x.med]))
        + ' / 作業ツリーは elf_male 1 枚共有 = ' + mw + 'px で完全同一');
    check('(N3.3) ⭐ HEAD の変種はいずれも主人公戦士と体高が不一致だった (パーティで浮いていた)',
      hvs.every(v => v > 0) && hvs.some(v => Math.abs(v - ww) >= 2),
      'HEAD=' + JSON.stringify(hvs) + ' warrior=' + ww + ' / 作業ツリー elf_male=' + mw);

    // ── N4 ⭐ ?v= bump / 取り残し修正の差分が実在することの証明 ─
    const headIdx = headBytes('index.html');
    const headTxt = headIdx ? String(headIdx) : '';
    check('(N4.1) HEAD の index.html を取得できている', !!headIdx, '(git show 失敗)');
    check('(N4.2) ⭐ HEAD では walk が ?v=2 / attack が ?v=3 だった (bump の差分が実在する)',
      /elf_walk\.png\?v=2/.test(headTxt) && /elf_attack\.png\?v=3/.test(headTxt)
        && !/elf_walk\.png\?v=3/.test(headTxt),
      'v2=' + /elf_walk\.png\?v=2/.test(headTxt) + ' v3atk=' + /elf_attack\.png\?v=3/.test(headTxt));
    // ⭐ これが今回いちばん価値のある N。LEADER_SPRITES.elf は **素パス** で 6 職中 elf だけ抜けていた。
    check('(N4.3) ⭐⭐ HEAD の index.html には素パス参照 assets/elf_walk.png") が実在した (LEADER_SPRITES.elf の取り残し)',
      /assets\/elf_walk\.png"\)/.test(headTxt),
      'bare=' + /assets\/elf_walk\.png"\)/.test(headTxt));
    check('(N4.4) ⭐ 作業ツリーの index.html には素パス参照が残っていない (取り残しを潰した証明)',
      !/assets\/elf_walk\.png"\)/.test(wtIdx) && !/assets\/elf_attack\.png"\)/.test(wtIdx),
      'walk_bare=' + /assets\/elf_walk\.png"\)/.test(wtIdx)
        + ' atk_bare=' + /assets\/elf_attack\.png"\)/.test(wtIdx));
    check('(N4.5) 作業ツリーには旧版 ?v= の取り残しが無い',
      !/elf_walk\.png\?v=2/.test(wtIdx) && !/elf_attack\.png\?v=3/.test(wtIdx),
      'v2=' + /elf_walk\.png\?v=2/.test(wtIdx) + ' v3=' + /elf_attack\.png\?v=3/.test(wtIdx));

    // ── N5 ⭐ 旧 chibi 変種参照の実在証明 ────────────────────
    check('(N5.1) ⭐ HEAD の index.html は変種 1-3 に elf_{high,huntress,shadow} を指していた',
      /elf_high_walk\.png/.test(headTxt) && /elf_huntress_walk\.png/.test(headTxt)
        && /elf_shadow_walk\.png/.test(headTxt),
      JSON.stringify([/elf_high_walk/.test(headTxt), /elf_huntress_walk/.test(headTxt), /elf_shadow_walk/.test(headTxt)]));
    check('(N5.2) ⭐ 作業ツリーの index.html から旧 chibi 変種参照が消えている',
      !/elf_high_walk\.png/.test(wtIdx) && !/elf_huntress_walk\.png/.test(wtIdx)
        && !/elf_shadow_walk\.png/.test(wtIdx),
      JSON.stringify([/elf_high_walk/.test(wtIdx), /elf_huntress_walk/.test(wtIdx), /elf_shadow_walk/.test(wtIdx)]));

    // ── N7 ⭐ 「変えていない」ことの正の assert ──────────────
    // 台帳 --all の再パックで他職 (戦士) が巻き添えになっていないかを画素で見る。
    const headWarrior = await page.evaluate(() => window.__sprMeasure('/__head__/assets/warrior_walk.png', 96, 6, 3))
      .catch(e => ({ err: String(e && e.message || e), frames: [] }));
    check('(N7.1) HEAD の warrior_walk.png を配信できている', !headWarrior.err && headWarrior.w === 576,
      JSON.stringify({ w: headWarrior.w, err: headWarrior.err }));
    check('(N7.2) ⭐ 戦士シートは HEAD と画素シグネチャが全コマ一致 = --all 再パックの巻き添えなし',
      !!headWarrior.frames && headWarrior.frames.length === 6 &&
      headWarrior.frames.every((f, i) => f && measured['warrior_walk.png'].frames[i] &&
                                         f.sig === measured['warrior_walk.png'].frames[i].sig),
      JSON.stringify([headWarrior.frames && headWarrior.frames.map(f => f && f.sig),
                      measured['warrior_walk.png'].frames.map(f => f && f.sig)]));

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
        elf: PARTY_PORTRAIT_SPRITES.elf.slice(),
        cleric: PARTY_PORTRAIT_SPRITES.cleric.slice(),
        rogue: PARTY_PORTRAIT_SPRITES.rogue.slice(),
        lens,
        vcount: (typeof VARIANT_COUNT !== 'undefined') ? VARIANT_COUNT.elf : null,
      };
    });
    check('(G7.1) PARTY_PORTRAIT_SPRITES.elf が 4 要素 (VARIANT_COUNT と整合)',
      port.elf.length === 4 && port.vcount === 4, JSON.stringify([port.elf.length, port.vcount]));
    check('(G7.2) 他 5 職の要素数 4 も維持 (回帰なし)',
      ['warrior', 'dwarf', 'cleric', 'mage', 'rogue'].every(k => port.lens[k] === 4), JSON.stringify(port.lens));
    check('(G7.3) elf[0] が elf_walk.png (正規 = 女エルフ)',
      port.elf[0] === 'assets/elf_walk.png', port.elf[0]);
    check('(G7.4) elf[1..3] が elf_male_walk.png を共有',
      port.elf.slice(1).every(u => u === 'assets/elf_male_walk.png'), JSON.stringify(port.elf.slice(1)));
    check('(G7.5) ポートレートは ?v= を付けない (明文ルール)',
      port.elf.every(u => !/\?/.test(u)), JSON.stringify(port.elf));
    check('(G7.6) 作業ツリーでは旧 chibi 参照が消えている',
      !port.elf.some(u => /elf_(high|huntress|shadow)_/.test(u)), JSON.stringify(port.elf));
    check('(G7.7) 直前の差替 (僧侶 / 盗賊) が回帰していない',
      port.cleric[0] === 'assets/cleric_walk.png'
        && port.cleric.slice(1).every(u => u === 'assets/cleric_npcmale_walk.png')
        && port.rogue[0] === 'assets/rogue_walk.png'
        && port.rogue.slice(1).every(u => u === 'assets/rogue_male_walk.png'),
      JSON.stringify([port.cleric, port.rogue]));
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
    }, port.elf);
    check('(G7.8) elf のポートレート 4 URL がすべて 200 かつ 576x384',
      loaded.every(x => x.ok), JSON.stringify(loaded));

    // ── N6 負のコントロール (HEAD の tavern) ────────────────
    const headTav = headBytes('tavern.html');
    const headLine = headTav ? String(headTav).split('\n').find(l => /elf:\s*\["assets\/elf_walk/.test(l)) : null;
    check('(N6.1) HEAD の tavern.html を取得できている', !!headLine, headTav ? '(elf 行なし)' : '(git show 失敗)');
    const headPort = headLine ? (headLine.match(/assets\/elf[a-z_]*\.png/g) || []) : [];
    check('(N6.2) ⭐ HEAD の elf ポートレートは旧 chibi 3 種 (high/huntress/shadow) を指していた = 同期の差分が実在',
      headPort.length === 4 && /elf_high_walk/.test(headPort[1] || '')
        && /elf_huntress_walk/.test(headPort[2] || '') && /elf_shadow_walk/.test(headPort[3] || ''),
      JSON.stringify(headPort));
    check('(N6.3) ⭐ 作業ツリーでは 3 枠が elf_male_walk.png へ収束している (HEAD とは違う)',
      port.elf.slice(1).every(u => u === 'assets/elf_male_walk.png')
        && !headPort.slice(1).every(u => u === 'assets/elf_male_walk.png'),
      JSON.stringify([headPort, port.elf]));
    check('(N6.4) HEAD 側にも ?v= が付いていない (素パスの明文ルールが維持されている)',
      !!headLine && !/elf[a-z_]*\.png\?v=/.test(headLine), (headLine || '').trim().slice(0, 140));

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
