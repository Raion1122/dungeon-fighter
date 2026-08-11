#!/usr/bin/env node
/*
 * driver_cleric_sprites.js — 僧侶 4 種の codex1 差替 (npc-female-cleric / npc-male-cleric) 検証ドライバ
 *
 *   node tools/driver_cleric_sprites.js [--headful] [--browser <path>] [--port N] [--root <dir>]
 *
 * 対象は index.html + tavern.html。
 *
 * 第1段 (2026-07-29 `c32f785`) = 僧侶 4 種を codex1 素材へ差替:
 *   - 正規 (変種 index 0)  assets/cleric_{walk,attack,cast}.png         <- codex1 npc-female-cleric (**同名上書き**)
 *   - 変種 index 1-3 共有  assets/cleric_npcmale_{walk,attack,cast}.png <- codex1 npc-male-cleric v1b (新規)
 *
 * 第2段 (2026-07-29 本コミット) = **近接 attack を melee 素材へ差替**:
 *   第1段の時点では codex1 素材に近接モーションが無く、attack は cast (詠唱) の 6F を
 *   [0,1,2,3,5] で間引いた流用だった (= 殴りかかりながら祈っていた)。codex1 へ依頼した
 *   …-melee-right-6-v1 が届いたので台帳の attack_dir を差し替え、同時に **cast_dir を明示**
 *   した (省略すると attack_dir 流用で詠唱までメイス振りに化ける仕様のため)。
 *   変わるのは attack 2 枚だけで、walk / cast はバイト不変。
 *
 *   G1  配線: SPRITE_VARIANTS.cleric / getSpriteSet が期待 URL を返す (変種 1-3 は同一 1 枚)
 *   G2  実体: 6 枚が 200 で読め、規格サイズ (walk/cast 576x384 / attack 480x384) である
 *   G3  体高パリティ: 画面上の体高が主人公戦士と同値。walk<->attack<->cast の変動が閾値内
 *   G4  重複コマ: row3 の全コマが互いに異なる (サイズ検査を素通りする軸)
 *   G5  当たり判定不変: CLASS_DEFS.cleric の displaySize / sprite
 *   G6  tavern: PARTY_PORTRAIT_SPRITES.cleric が 4 要素で全部 200
 *   G7  ⭐ **cast 流用が解消された証明**: attack の 5 コマが cast の [0,1,2,3,5] と画素シグネチャ
 *          **不一致** (第1段では逆向きの assert = 一致 だった。melee 差替でここが反転する)
 *   G8  ⭐ cast の variant 対応: updateAllySprite が変種ごとに別の cast シートを出す
 *
 * ⚠️ 本ドライバの肝は **同一 run に内包した負のコントロール** (N1-N5)。
 *    `/__base__/<path>` ルートで `git show HEAD:<path>` の生バイトを同時配信し、差替前と作業ツリーを
 *    同じ物差しで測る。baseline が PASS するだけでは空振り (作業ツリーを 2 回測る事故) を検出できない。
 *
 * ⚠️⚠️ N ブロックは **第2段に合わせて書き直してある**。第1段の N (「HEAD の変種は旧 chibi」等) は
 *    HEAD が c32f785 を含んだ時点で **自己失効** した (盗賊ドライバ driver_rogue_sprites.js と同じ現象)。
 *    負のコントロールは「今回の差分」を測るものへ毎回更新しないと空振りする。現行の向き:
 *      N1 = 「attack 2 枚は 差替前と画素が *相違*」 = melee 差替が本当に効いた証明 (?v= だけでは足りない)
 *      N2 = 「HEAD の attack は HEAD の cast の [0,1,2,3,5] と *一致* していた」= 直した不具合の実在証明
 *      N3 = 「walk / cast は 差替前と画素が *一致*」 = cast_dir 明示が cast を壊していない証明
 *      N4 = 「HEAD の index.html は attack が ?v=4 / 変種は ?v= 無し」= bump の差分が実在する証明
 *      N5 = 「戦士シートは 差替前と画素が *一致する*」= 台帳 --all 再パックの巻き添えが無い証明
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
const PORT    = parseInt(arg('port', '8883'), 10);

// pack_codex1_player.py の 6F -> 5F 間引き。attack が cast 由来であることの検算に使う。
const ATTACK_KEYS = [0, 1, 2, 3, 5];

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

/* ⚠⚠ 負のコントロールの基準は **差替前はなく「差替が入る直前のコミット」に固定する**。
 *   HEAD 基準だと差替をコミットした瞬間に `HEAD === 作業ツリー` になり、N ブロック
 *   (「差替前は cast 流用だった」= 差分の実在証明) が **自己失効して赤いまま安定する**。
 *   実際このドライバは第1段 (c32f785) で一度その壊れ方をし、第2段 (5fd3ae1) でも再発した。
 *   ⭐ 「機能が入る直前」は歴史的事実なので、以後どれだけコミットが進んでも陳腐化しない
 *     = 差替のたびに N ブロックを書き直す必要がなくなる。
 *   ⚠ N5 の「戦士シートは一致する」(台帳 --all 再パックの巻き添えが無い証明) も同じ基準でよい。
 *     5fd3ae1^ には戦士差替 (1be27b8) が既に入っている (祖先関係を実測済み)。 */
const BASE_REV = '5fd3ae1^';   // 5fd3ae1 = 「僧侶の近接 attack を melee 素材へ差替」。その親 = 差替前。

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
  const profile = require('./_pptr_profile')('df_cleric_');
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
  const feetOf = (m) => m.frames.filter(Boolean).map(f => f.feet);
  const maxFeet = (m) => Math.max.apply(null, feetOf(m));

  // ═══════════ index.html ═══════════
  {
    const page = await browser.newPage();
    page.on('pageerror', e => allPageErrors.push(String(e && e.message || e)));
    await page.evaluateOnNewDocument(PAGE_HELPERS);
    await page.goto(base + '/index.html?autoplay=1&intel=0', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof SPRITE_VARIANTS !== 'undefined', { timeout: 20000 });

    // ── G1 配線 ─────────────────────────────────────────────
    const wire = await page.evaluate(() => {
      const out = { len: SPRITE_VARIANTS.cleric.length, sets: [] };
      for (let v = 0; v < 4; v++) {
        const s = getSpriteSet('cleric', v);
        out.sets.push({ walk: s.walk, attack: s.attack, cast: s.cast || null,
                        ws: s.walkSize, as: s.attackSize, cs: s.castSize || null, label: s.label });
      }
      out.player = (typeof LEADER_SPRITES !== 'undefined') ? LEADER_SPRITES.cleric : null;
      out.custom = (typeof CUSTOM_SHEET_CLASSES !== 'undefined') && CUSTOM_SHEET_CLASSES.has('cleric');
      out.castCls = (typeof CAST_SHEET_CLASSES !== 'undefined') && CAST_SHEET_CLASSES.has('cleric');
      out.wrap = getSpriteSet('cleric', 9).walk === getSpriteSet('cleric', 1).walk;
      return out;
    });
    check('(G1.1) SPRITE_VARIANTS.cleric が 4 変種のまま', wire.len === 4, wire.len);
    check('(G1.2) 変種 0 (正規) の walk = cleric_walk.png?v=3 (同名上書きなので ?v= bump 必須)',
      /assets\/cleric_walk\.png\?v=3/.test(wire.sets[0].walk), wire.sets[0].walk);
    check('(G1.3) 変種 0 の attack = cleric_attack.png?v=5 (melee 差替で ?v=4 から bump)',
      /assets\/cleric_attack\.png\?v=5/.test(wire.sets[0].attack), wire.sets[0].attack);
    check('(G1.4) 変種 0 の cast = cleric_cast.png?v=5',
      /assets\/cleric_cast\.png\?v=5/.test(wire.sets[0].cast || ''), wire.sets[0].cast);
    check('(G1.5) 変種 1-3 が cleric_npcmale_walk.png を共有',
      [1, 2, 3].every(v => /assets\/cleric_npcmale_walk\.png/.test(wire.sets[v].walk)),
      JSON.stringify(wire.sets.slice(1).map(s => s.walk)));
    check('(G1.6) 変種 1-3 が cleric_npcmale_attack.png?v=2 を共有 (melee 差替で同名上書きになり ?v= を新規付与)',
      [1, 2, 3].every(v => /assets\/cleric_npcmale_attack\.png\?v=2/.test(wire.sets[v].attack)),
      JSON.stringify(wire.sets.slice(1).map(s => s.attack)));
    check('(G1.7) ⭐ 変種 1-3 が **自分の** cast (cleric_npcmale_cast.png) を持つ',
      [1, 2, 3].every(v => /assets\/cleric_npcmale_cast\.png/.test(wire.sets[v].cast || '')),
      JSON.stringify(wire.sets.slice(1).map(s => s.cast)));
    check('(G1.8) ⭐ 正規と変種の cast が別シート (詠唱の瞬間に正規へ化けない)',
      !!wire.sets[0].cast && wire.sets[0].cast !== wire.sets[1].cast,
      JSON.stringify([wire.sets[0].cast, wire.sets[1].cast]));
    check('(G1.9) 変種 1-3 に旧 chibi (elder/priestess/war) が残っていない',
      [1, 2, 3].every(v => !/cleric_(elder|priestess|war)_/.test(wire.sets[v].walk + wire.sets[v].attack + (wire.sets[v].cast || ''))),
      JSON.stringify(wire.sets.slice(1)));
    // ⚠ ?v= は「同名上書きの時だけ」付ける。機械的に全部へ付けるものではない。
    //   walk / cast は第1段の新規ファイル名のまま中身も不変 = 付けない。
    //   attack だけが第2段で同名上書きされたので ?v=2 を新規付与している。
    check('(G1.10) 変種の walk / cast には ?v= を付けていない (中身が不変なので不要)',
      [1, 2, 3].every(v => !/npcmale_walk\.png\?/.test(wire.sets[v].walk)
                        && !/npcmale_cast\.png\?/.test(wire.sets[v].cast || '')),
      JSON.stringify(wire.sets.slice(1).map(s => [s.walk, s.cast])));
    check('(G1.11) label は 3 種のまま (内部識別子は温存)',
      wire.sets[1].label === '老神官' && wire.sets[2].label === '女神官' && wire.sets[3].label === '戦僧',
      JSON.stringify(wire.sets.map(s => s.label)));
    check('(G1.12) 全変種のシート寸法指定が規格どおり (walk/cast 576x384, attack 480x384)',
      wire.sets.every(s => s.ws === '576px 384px' && s.as === '480px 384px' && s.cs === '576px 384px'),
      JSON.stringify(wire.sets.map(s => [s.ws, s.as, s.cs])));
    check('(G1.13) 主人公用 LEADER_SPRITES.cleric も ?v=3 / ?v=5 へ bump 済み (取り残しなし)',
      !!wire.player && /cleric_walk\.png\?v=3/.test(wire.player.walk)
        && /cleric_attack\.png\?v=5/.test(wire.player.attack),
      JSON.stringify(wire.player));
    check('(G1.14) cleric は専用シートクラスのまま', wire.custom === true, wire.custom);
    check('(G1.15) cleric は cast シートクラスのまま', wire.castCls === true, wire.castCls);
    check('(G1.16) 範囲外 index は剰余で丸まる (getSpriteSet の既存契約)', wire.wrap === true, wire.wrap);

    // ── G2 実体 (404 なし / 規格サイズ) ─────────────────────
    const sheets = [
      ['cleric_walk.png?v=3',        WALK_SIZE, 6],
      ['cleric_attack.png?v=5',      ATK_SIZE,  5],
      ['cleric_cast.png?v=5',        WALK_SIZE, 6],
      ['cleric_npcmale_walk.png',    WALK_SIZE, 6],
      ['cleric_npcmale_attack.png?v=2', ATK_SIZE, 5],
      ['cleric_npcmale_cast.png',    WALK_SIZE, 6],
      ['warrior_walk.png?v=8',       WALK_SIZE, 6],
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
    const ww = med(measured['warrior_walk.png']);
    const fw = med(measured['cleric_walk.png']);
    const fa = med(measured['cleric_attack.png']);
    const fc = med(measured['cleric_cast.png']);
    const mw = med(measured['cleric_npcmale_walk.png']);
    const ma = med(measured['cleric_npcmale_attack.png']);
    const mc = med(measured['cleric_npcmale_cast.png']);
    check('(G3.1) 主人公戦士の体高を実測できている (56px 前後)', ww >= 50 && ww <= 62, ww);
    check('(G3.2) 正規僧侶の walk 体高が主人公戦士と同値', fw === ww, 'cleric=' + fw + ' warrior=' + ww);
    check('(G3.3) 変種僧侶の walk 体高も主人公戦士と同値', mw === ww, 'npcmale=' + mw + ' warrior=' + ww);
    check('(G3.4) 正規: walk->attack の体高変動が ±5% 以内',
      Math.abs((fa - fw) / fw) < 0.05, ((fa - fw) / fw * 100).toFixed(2) + '%');
    check('(G3.5) ⭐ 正規: walk->cast の体高変動が ±5% 以内 (差替前は +19% で詠唱時に膨らんでいた)',
      Math.abs((fc - fw) / fw) < 0.05, ((fc - fw) / fw * 100).toFixed(2) + '%');
    check('(G3.6) 変種: walk->attack の体高変動が ±5% 以内',
      Math.abs((ma - mw) / mw) < 0.05, ((ma - mw) / mw * 100).toFixed(2) + '%');
    check('(G3.7) 変種: walk->cast の体高変動が ±5% 以内',
      Math.abs((mc - mw) / mw) < 0.05, ((mc - mw) / mw * 100).toFixed(2) + '%');
    for (const grp of [['正規', 'cleric_walk.png', 'cleric_attack.png', 'cleric_cast.png'],
                       ['変種', 'cleric_npcmale_walk.png', 'cleric_npcmale_attack.png', 'cleric_npcmale_cast.png']]) {
      const [tag, w, a, c] = grp;
      check('(G3.8) ' + tag + ': walk / attack / cast の接地線が 3 枚とも一致 (足が浮かない/沈まない)',
        Math.abs(maxFeet(measured[w]) - maxFeet(measured[a])) <= 1 &&
        Math.abs(maxFeet(measured[w]) - maxFeet(measured[c])) <= 1,
        JSON.stringify([maxFeet(measured[w]), maxFeet(measured[a]), maxFeet(measured[c])]));
    }
    check('(G3.9) 全コマがセル内に収まる (足元がセル底を突き抜けない)',
      Object.values(measured).every(m => m.frames.filter(Boolean).every(f => f.feet <= 95)),
      JSON.stringify(Object.entries(measured).map(([k, m]) => [k, maxFeet(m)])));
    const clericKeys = ['cleric_walk.png', 'cleric_attack.png', 'cleric_cast.png',
                        'cleric_npcmale_walk.png', 'cleric_npcmale_attack.png', 'cleric_npcmale_cast.png'];
    const xspan = clericKeys.map(k => measured[k].frames.filter(Boolean).map(f => [f.x0, f.x1]));
    check('(G3.10) 僧侶 6 シートともセル右端で切れていない (x1 <= 95)',
      xspan.every(fr => fr.every(([, x1]) => x1 <= 95)), JSON.stringify(xspan));
    check('(G3.11) 僧侶 6 シートともセル左端で切れていない (x0 >= 1)',
      xspan.every(fr => fr.every(([x0]) => x0 >= 1)), JSON.stringify(xspan));

    // ── G4 重複コマ ─────────────────────────────────────────
    for (const key of clericKeys) {
      const sigs = measured[key].frames.filter(Boolean).map(f => f.sig);
      check('(G4) ' + key + ' の row3 に重複コマなし',
        sigs.length > 0 && new Set(sigs).size === sigs.length, JSON.stringify(sigs));
    }

    // ── G5 当たり判定不変 ───────────────────────────────────
    const hit = await page.evaluate(() => ({
      disp: (typeof CLASS_DEFS !== 'undefined') ? CLASS_DEFS.cleric.displaySize : null,
      sprite: (typeof CLASS_DEFS !== 'undefined') ? CLASS_DEFS.cleric.sprite : null,
      wdisp: (typeof CLASS_DEFS !== 'undefined') ? CLASS_DEFS.warrior.displaySize : null,
    }));
    check('(G5.1) CLASS_DEFS.cleric.displaySize が 96 据置 (当たり判定不変)', hit.disp === 96, hit.disp);
    check('(G5.2) CLASS_DEFS.cleric.sprite も ?v=3 へ bump 済み (取り残しなし)',
      /cleric_walk\.png\?v=3/.test(hit.sprite || ''), hit.sprite);
    check('(G5.3) 戦士の displaySize も 96 のまま (回帰なし)', hit.wdisp === 96, hit.wdisp);

    // ── G7 ⭐ cast 流用が解消されたことの証明 ────────────────
    // 第1段では attack が cast の 6F を [0,1,2,3,5] で間引いた流用だったので、この assert は
    // 「全コマ一致」を PASS 条件にしていた。第2段の melee 差替でその向きが **反転する**。
    // ⚠️ 「1 コマでも違う」ではなく **全 5 コマとも別画素** を条件にする。melee は独立に描かれた
    //    別モーションなので、たまたま 1 コマだけ一致することは無い。緩い条件にすると
    //    「半分だけ差し替わった」ような中途半端な事故を見逃す。
    for (const [tag, a, c] of [['正規', 'cleric_attack.png', 'cleric_cast.png'],
                               ['変種', 'cleric_npcmale_attack.png', 'cleric_npcmale_cast.png']]) {
      const af = measured[a].frames, cf = measured[c].frames;
      const allDiffer = af.length === 5 && cf.length === 6 &&
        ATTACK_KEYS.every((k, i) => af[i] && cf[k] && af[i].sig !== cf[k].sig);
      check('(G7) ⭐ ' + tag + ': attack 5 コマが cast の [0,1,2,3,5] と **全コマ画素相違** (cast 流用の解消)',
        allDiffer, JSON.stringify([af.map(f => f && f.sig), cf.map(f => f && f.sig)]));
    }

    // ── G8 ⭐ cast の variant 対応 (統合検証) ────────────────
    // updateAllySprite を偽 ally で直接叩き、詠唱中に **変種ごとに違う** cast シートが
    // backgroundImage へ入ることを見る。配線 (G1.7) だけでは詠唱分岐の改修が効いた証拠にならない。
    const castApplied = await page.evaluate(() => {
      const out = { err: null, urls: [] };
      try {
        for (let v = 0; v < 4; v++) {
          const el = document.createElement('div');
          el.style.position = 'absolute'; el.style.left = '-9999px';
          document.body.appendChild(el);
          const ally = {
            el, classKey: 'cleric', variant: v, facing: 'right',
            animTick: 0, _animFrameId: -1, playerMovingThisFrame: false,
            castAnimActive: true, castAnimStart: performance.now(), castAnimDuration: 999999,
            x: 0, y: 0, hp: 10, hpMax: 10,
          };
          updateAllySprite(ally);
          out.urls.push(el.style.backgroundImage);
          el.remove();
        }
      } catch (e) { out.err = String(e && e.message || e); }
      return out;
    });
    check('(G8.1) updateAllySprite を偽 ally で駆動できている', !castApplied.err, castApplied.err);
    check('(G8.2) ⭐ 正規 (variant 0) の詠唱で cleric_cast.png が適用される',
      /cleric_cast\.png/.test(castApplied.urls[0] || ''), castApplied.urls[0]);
    check('(G8.3) ⭐ 変種 1-3 の詠唱で cleric_npcmale_cast.png が適用される (正規へ化けない)',
      [1, 2, 3].every(v => /cleric_npcmale_cast\.png/.test(castApplied.urls[v] || '')),
      JSON.stringify(castApplied.urls.slice(1)));
    check('(G8.4) 正規と変種で実際に別 URL が出ている',
      !!castApplied.urls[0] && castApplied.urls[0] !== castApplied.urls[1],
      JSON.stringify([castApplied.urls[0], castApplied.urls[1]]));

    // ── N1 ⭐ 「変えた」ことの正の assert (attack は同名上書き) ──
    // ⚠️ HEAD は既に第1段 (c32f785) を含むので、第1段を測る N (旧 chibi 参照 / 58px→56px /
    //    cast が walk より 19% 大きい 等) は **自己失効している**。ここは第2段だけを測る。
    const headAtkF = await page.evaluate(() => window.__sprMeasure('/__base__/assets/cleric_attack.png', 96, 5, 3))
      .catch(e => ({ err: String(e && e.message || e), frames: [] }));
    const headAtkM = await page.evaluate(() => window.__sprMeasure('/__base__/assets/cleric_npcmale_attack.png', 96, 5, 3))
      .catch(e => ({ err: String(e && e.message || e), frames: [] }));
    check('(N1.1) HEAD の cleric_attack.png を配信できている (対照群が空振りでない)',
      !headAtkF.err && headAtkF.w === 480, JSON.stringify({ w: headAtkF.w, err: headAtkF.err }));
    check('(N1.2) HEAD の cleric_npcmale_attack.png を配信できている',
      !headAtkM.err && headAtkM.w === 480, JSON.stringify({ w: headAtkM.w, err: headAtkM.err }));
    for (const [tag, head, key] of [['正規', headAtkF, 'cleric_attack.png'],
                                    ['変種', headAtkM, 'cleric_npcmale_attack.png']]) {
      check('(N1.3) ⭐ ' + tag + ' の attack は 差替前と画素シグネチャが全コマ相違 = melee 差替が本当に効いている',
        !!head.frames && head.frames.length === 5 &&
        head.frames.every((f, i) => f && measured[key].frames[i] && f.sig !== measured[key].frames[i].sig),
        JSON.stringify([head.frames && head.frames.map(f => f && f.sig),
                        measured[key].frames.map(f => f && f.sig)]));
    }

    // ── N2 ⭐ 直した不具合が HEAD に実在したことの証明 ───────
    // G7 の反転前の向き (attack が cast の [0,1,2,3,5] 間引き) を **HEAD 側で** 測る。
    // これが PASS して初めて「G7 の反転は実際の修正によるもので、assert を緩めただけではない」と言える。
    const headCastF = await page.evaluate(() => window.__sprMeasure('/__base__/assets/cleric_cast.png', 96, 6, 3))
      .catch(e => ({ err: String(e && e.message || e), frames: [] }));
    const headCastM = await page.evaluate(() => window.__sprMeasure('/__base__/assets/cleric_npcmale_cast.png', 96, 6, 3))
      .catch(e => ({ err: String(e && e.message || e), frames: [] }));
    for (const [tag, ha, hc] of [['正規', headAtkF, headCastF], ['変種', headAtkM, headCastM]]) {
      check('(N2) ⭐ ' + tag + ': 差替前は attack が cast の [0,1,2,3,5] と全コマ画素一致だった (cast 流用の実在証明)',
        !!ha.frames && ha.frames.length === 5 && !!hc.frames && hc.frames.length === 6 &&
        ATTACK_KEYS.every((k, i) => ha.frames[i] && hc.frames[k] && ha.frames[i].sig === hc.frames[k].sig),
        JSON.stringify([ha.frames && ha.frames.map(f => f && f.sig), hc.frames && hc.frames.map(f => f && f.sig)]));
    }

    // ── N3 ⭐ 「変えていない」ことの正の assert (walk / cast) ──
    // cast_dir を台帳へ明示した副作用で cast が動いていないか、画素で確かめる。
    // ⚠️ ここが落ちたら cast_dir の指し先を間違えている (= 詠唱がメイス振りに化けている)。
    const headWalkF = await page.evaluate(() => window.__sprMeasure('/__base__/assets/cleric_walk.png', 96, 6, 3))
      .catch(e => ({ err: String(e && e.message || e), frames: [] }));
    const headWalkM = await page.evaluate(() => window.__sprMeasure('/__base__/assets/cleric_npcmale_walk.png', 96, 6, 3))
      .catch(e => ({ err: String(e && e.message || e), frames: [] }));
    for (const [tag, head, key] of [['正規 walk', headWalkF, 'cleric_walk.png'],
                                    ['変種 walk', headWalkM, 'cleric_npcmale_walk.png'],
                                    ['正規 cast', headCastF, 'cleric_cast.png'],
                                    ['変種 cast', headCastM, 'cleric_npcmale_cast.png']]) {
      check('(N3) ⭐ ' + tag + ' は 差替前と画素シグネチャが全コマ一致 = cast_dir 明示で壊していない',
        !!head.frames && head.frames.length === 6 &&
        head.frames.every((f, i) => f && measured[key].frames[i] && f.sig === measured[key].frames[i].sig),
        JSON.stringify([head.frames && head.frames.map(f => f && f.sig),
                        measured[key].frames.map(f => f && f.sig)]));
    }

    // ── N4 ⭐ ?v= bump の差分が実在することの証明 ─────────────
    const headIdx = baseBytes('index.html');
    const headTxt = headIdx ? String(headIdx) : '';
    check('(N4.1) HEAD の index.html を取得できている', !!headIdx, '(git show 失敗)');
    check('(N4.2) ⭐ 差替前は正規 attack が ?v=4 だった (bump の差分が実在する)',
      /cleric_attack\.png\?v=4/.test(headTxt) && !/cleric_attack\.png\?v=5/.test(headTxt),
      'v4=' + /cleric_attack\.png\?v=4/.test(headTxt) + ' v5=' + /cleric_attack\.png\?v=5/.test(headTxt));
    check('(N4.3) ⭐ 差替前は変種 attack に ?v= が無かった (新規付与の差分が実在する)',
      /cleric_npcmale_attack\.png"/.test(headTxt) && !/cleric_npcmale_attack\.png\?v=/.test(headTxt),
      'bare=' + /cleric_npcmale_attack\.png"/.test(headTxt));
    check('(N4.4) 作業ツリーには ?v=4 の取り残しが無い',
      !wire.sets.some(s => /cleric_attack\.png\?v=4/.test(s.attack))
        && !/cleric_attack\.png\?v=4/.test(wire.player ? wire.player.attack : ''),
      JSON.stringify([wire.sets.map(s => s.attack), wire.player && wire.player.attack]));

    // ── N5 ⭐ 「変えていない」ことの正の assert ──────────────
    // 台帳 --all の再パックで他職 (戦士) が巻き添えになっていないかを画素で見る。
    const headWarrior = await page.evaluate(() => window.__sprMeasure('/__base__/assets/warrior_walk.png', 96, 6, 3))
      .catch(e => ({ err: String(e && e.message || e), frames: [] }));
    check('(N5.1) HEAD の warrior_walk.png を配信できている', !headWarrior.err && headWarrior.w === 576,
      JSON.stringify({ w: headWarrior.w, err: headWarrior.err }));
    check('(N5.2) ⭐ 戦士シートは 差替前と画素シグネチャが全コマ一致 = --all 再パックの巻き添えなし',
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
        cleric: PARTY_PORTRAIT_SPRITES.cleric.slice(),
        warrior: PARTY_PORTRAIT_SPRITES.warrior.slice(),
        rogue: PARTY_PORTRAIT_SPRITES.rogue.slice(),
        lens,
        vcount: (typeof VARIANT_COUNT !== 'undefined') ? VARIANT_COUNT.cleric : null,
      };
    });
    check('(G6.1) PARTY_PORTRAIT_SPRITES.cleric が 4 要素 (VARIANT_COUNT と整合)',
      port.cleric.length === 4 && port.vcount === 4, JSON.stringify([port.cleric.length, port.vcount]));
    check('(G6.2) 他 5 職の要素数 4 も維持 (回帰なし)',
      ['warrior', 'dwarf', 'mage', 'elf', 'rogue'].every(k => port.lens[k] === 4), JSON.stringify(port.lens));
    check('(G6.3) cleric[0] が cleric_walk.png (正規)',
      port.cleric[0] === 'assets/cleric_walk.png', port.cleric[0]);
    check('(G6.4) cleric[1..3] が cleric_npcmale_walk.png を共有',
      port.cleric.slice(1).every(u => u === 'assets/cleric_npcmale_walk.png'),
      JSON.stringify(port.cleric.slice(1)));
    check('(G6.5) ポートレートは ?v= を付けない (明文ルール)',
      port.cleric.every(u => !/\?/.test(u)), JSON.stringify(port.cleric));
    check('(G6.6) 直前の差替 (戦士 / 盗賊) が回帰していない',
      port.warrior[0] === 'assets/warrior_walk.png'
        && port.warrior.slice(1).every(u => u === 'assets/warrior_npcfemale_walk.png')
        && port.rogue[0] === 'assets/rogue_walk.png'
        && port.rogue.slice(1).every(u => u === 'assets/rogue_male_walk.png'),
      JSON.stringify([port.warrior, port.rogue]));
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
    }, port.cleric);
    check('(G6.7) cleric のポートレート 4 URL がすべて 200 かつ 576x384',
      loaded.every(x => x.ok), JSON.stringify(loaded));

    // ── N6 負のコントロール (HEAD の tavern) ────────────────
    // ⚠️ 第1段では「HEAD のポートレートは旧 chibi」を測っていたが、HEAD が c32f785 を含んだ時点で
    //    **自己失効**した (N1 の注記と同じ現象)。第2段が tavern.html で触るのは changelog の
    //    <li> だけでポートレート配線には無関係なので、ここでの正しい負のコントロールは
    //    「ポートレート 4 URL が 差替前と **完全一致**」= 配線を巻き添えにしていない証明。
    const headTav = baseBytes('tavern.html');
    const headLine = headTav ? String(headTav).split('\n').find(l => /cleric:\s*\["assets\/cleric_walk/.test(l)) : null;
    check('(N6.1) HEAD の tavern.html を取得できている', !!headLine, headTav ? '(cleric 行なし)' : '(git show 失敗)');
    const headPort = headLine ? (headLine.match(/assets\/cleric[a-z_]*\.png/g) || []) : [];
    check('(N6.2) ⭐ 差替前と作業ツリーで cleric ポートレート 4 URL が完全一致 = 第2段はポートレート配線を触っていない',
      headPort.length === 4 && port.cleric.length === 4 &&
      headPort.every((u, i) => port.cleric[i] === u),
      JSON.stringify([headPort, port.cleric]));
    check('(N6.3) HEAD 側にも ?v= が付いていない (素パスの明文ルールが第1段から維持されている)',
      !!headLine && !/cleric[a-z_]*\.png\?v=/.test(headLine), (headLine || '').trim().slice(0, 140));
    check('(N6.4) 作業ツリーでは旧 chibi 参照が消えている',
      !port.cleric.some(u => /cleric_(elder|priestess|war)_/.test(u)), JSON.stringify(port.cleric));

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
