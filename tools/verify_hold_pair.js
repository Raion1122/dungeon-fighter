#!/usr/bin/env node
/*
 * verify_hold_pair.js — 実装依頼書 #69「ホールド・パーソンを 2 体へ」の受入 (§8)
 * ═══════════════════════════════════════════════════════════════════════════
 *   node tools/verify_hold_pair.js [--headful] [--port N] [--browser <path>]
 *   node tools/verify_hold_pair.js --negative              ← 負のコントロール (1 本ずつ)
 *   node tools/verify_hold_pair.js --negative --only nospread
 *   node tools/verify_hold_pair.js --noplay                ← 開発用 (⚠ (0e) が **赤**になる)
 *
 * ── 方針 (依頼書 §8 冒頭・ユーザー決定) ────────────────────────────────────
 *   **合成盤面で「1 回で 2 体」を決定論で固める。実プレイは記録だけで、合否に効くのは
 *     記録が空でないこと (0e) だけ。**
 *
 * ── 測っているもの ─────────────────────────────────────────────────────────
 *   §0 装置   (0a) 配信バイトの逐語 1 箇所  (0b) 合成盤面の前提 (僧侶/枠/部屋の敵を退けた)
 *             (0c) d20 差し替えが効く      (0d) dfPlayCast は 1 盤面 1 回
 *             (0e) 実プレイの記録が空でない
 *   §1 合成盤面 (1a) 2 体 held + 枠 1 + mp 7  (1b) ロールは対象ごと独立
 *             (1c) 1 体目から 6 マスの上限   (1d) 免疫の除外  (1e) 近さの基準は 1 体目
 *             (1e2) 金縛り中の除外          (1f) 1 体でも撃つ (1g) 吹き出しは敵の頭上
 *             (1h) 1 体目が免疫でも 2 体目は掛かる (1i) 2 経路 (ドライバの独立計算と一致)
 *   §2 実プレイ (2a) 記録と総括 / (2b) 候補が居たのに 1 体だった件数 … **合否に使わない**
 *   §3 文言   (3a) index / tavern の flavor × 素・撤退
 *   §4 撤退   (4a) ?holdpair=0 で 1 体だけ (⭐ (1a) と同じ assert 本体を両腕へ)
 *   §5 導出   (5a) ?dndrange=0 で spread が 3 になる (⛔ 6 の直書きなら赤)
 *
 * ── ⛔ 測らないこと (依頼書 §8。実装窓が善意で縛りにいかないよう明記する) ──
 *   ・実プレイの率の閾値 (2 体に掛けた割合 / 平均体数 / 候補が居た割合) — **記録だけ**
 *   ・クリア率 / 被ダメージ / 難易度            (§9 の実機体感)
 *   ・輪と吹き出しの見た目・読みやすさ          (§9)
 *   ・clericAI の梯子の位置と発射率             (#57 / #59 が実機体感へ外したもの)
 *   ・眠っている敵を 2 体目に選ぶか             (述語を分けないのが仕様 = §2-5)
 *
 * ── ⚠ 計測機構 (踏みやすい罠) ───────────────────────────────────────────────
 *  - ROOT は必ず path.resolve を通す (区切りのまま join すると配信が全 404 になる)。
 *  - ⚠ ポートは **10331**。⛔ 10080 は Chrome が net::ERR_UNSAFE_PORT で拒否する (#56)。
 *    負のコントロールの子プロセスは 10332〜10343 (変異 12 本)。
 *  - ⚠ 変異は **2 ファイルにまたがる** (flavor1 が tavern.html) ので mutate() に file を持たせる。
 *  - ⚠ index.html / tavern.html はディスク上 **CRLF**。複数行アンカーは CRLF で書く。
 *  - ⚠ classic script 直下の let/const/function は window に載らない → **裸の識別子**で読む
 *    (allies / enemies / holdRings / HOLD_PAIR_ON / CLERIC_SKILLS がそれ)。
 *  - ⚠ sleepMs の差し替えは必ず setTimeout(r, 0)。Promise.resolve() はマイクロタスク飢餓で
 *    CDP の evaluate が 180s ProtocolError で死ぬ (既出の恒久教訓)。
 *  - ⭐ 合成盤面は **撃つ前に部屋に元から居る敵と他の味方を退ける** (x = y = -999999)。
 *    ⛔ alive を倒さない (撃破処理が走って別の交絡になる)。退け残りの検算は「動かした体数」
 *    ではなく **「術者から射程以内に残っている元からの敵 = 0」** で取る (#69 項目3 の教訓)。
 *  - ⚠ 合成盤面では僧侶の mp が 0 のことがある (ally.mp は Math.max(0,…) で下げ止まる)
 *    ⇒ 「7 減る」を測る前に mp を積む (⛔ 実装側の mp 行は 1 文字も触っていない)。
 *  - ⚠ HOLD_RING_MAX = 4 なので、輪の本数を見る前に **レジストリを空にしてから**撃つ
 *    (removeHoldRing を呼ぶだけ。⛔ 盤面や状態には触らない)。
 *  - ⭐ 命中ロールは window.d20 を列で差し替えて固定し、**呼んだ直後に必ず元へ戻す**。
 *    ⛔ tries で撃ち直さない (2 体を同時に見るので 1 体目の結果が上書きされる)。
 *  - ⭐ 2 経路目 = 「金縛りになるべき敵の集合」を **ドライバが自分の置いた座標と型から独立に**
 *    計算する (⛔ pickHoldPersonTarget の戻り値を期待値にしない)。
 *  - 吹き出しは MutationObserver で `.rollPop` の追加を拾う (1.3 秒で消えるので後から読めない)。
 *  - ⚠ 実プレイは `--negative` では走らせない (12 本 × 15 分になる)。(0e)(2a)(2b) は PENDING。
 *  - 後始末は **このドライバが起動したもの** (内蔵サーバとこのブラウザ) だけ。
 *
 * ── 負のコントロール (--negative) ────────────────────────────────────────────
 *   依頼書 §8 の変異表 12 本。⚠⚠⚠ **1 本ずつ** `--only <tag>` で確定させる
 *   (同時に入れると互いを覆い隠す)。--only 無しの --negative は自分自身を 1 本ずつ
 *   子プロセスで呼び直す。
 *   ⚠ NEG_EXPECT は机上で書かない。1 本ずつ実走して**実際に赤くなったラベル**を書く。
 */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const ROOT = path.resolve(__dirname, '..');           // ⚠ path.resolve 必須
const argv = process.argv.slice(2);
const arg  = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.indexOf('--' + n) >= 0;
const HEADFUL  = flag('headful');
const NEGATIVE = flag('negative');
const NOPLAY   = flag('noplay');
const ONLY     = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
/* ⚠⚠⚠ 10080 は Chrome の制限ポート (net::ERR_UNSAFE_PORT)。
   base 10331 は着手前に実測して未使用 (既存 base = 10201/10221/10241/10261/10281/10301)。 */
const PORT     = parseInt(arg('port', '10331'), 10);
/* ⛔ orc-fort を既定にしない (locked:true で #btnAccept が黙って return する)。 */
const SCENARIO = arg('scenario', 'goblin-mine');
/* 実プレイ (§2)。⭐ N は #69 項目1 の実測 (3.56 詠唱/走行) から「素の腕で詠唱 10 発以上」= 3 走行。
   3 舞台 × runs 本ずつを素と撤退の 2 腕で回す。 */
const PLAY_MAPS = ['goblin-mine', 'bandits-forest', 'lizard-swamp'];
const PLAY_RUNS = parseInt(arg('runs', '1'), 10);     // 1 舞台あたりの走行数 (既定 1 → 腕あたり 3 走行)
const PLAY_SECS = parseInt(arg('playsecs', '150'), 10);

/* ══════════════════════════════════════════════════════════════════════════
 * 配信バイトの凍結 + 負のコントロールの注入
 *   ⛔ 本番ファイルは 1 バイトも書き換えない。配信スナップショットだけを変異させる。
 * ══════════════════════════════════════════════════════════════════════════ */
const FROZEN = {
  '/index.html':  fs.readFileSync(path.join(ROOT, 'index.html')),
  '/tavern.html': fs.readFileSync(path.join(ROOT, 'tavern.html')),
};
const PRISTINE = {
  '/index.html':  FROZEN['/index.html'].toString('utf8'),
  '/tavern.html': FROZEN['/tavern.html'].toString('utf8'),
};
const CRLF = PRISTINE['/index.html'].includes('\r\n') ? '\r\n' : '\n';
const INJECTED = [];

/* ⭐⭐⭐ アンカー健在チェックは **手つかずの原本** に対して行う (#56 の教訓)。
   変異後のバッファで数えると、同じアンカーを共有する 2 本目が「注入点 0 箇所」=
   偽のアンカー腐敗 (exit 3) になり、いちばん大事な変異が 1 度も走らない。 */
function mutate(file, label, anchor, patch) {
  const tag  = label.split(' ')[0];
  const hits = PRISTINE[file].split(anchor).length - 1;
  if (hits !== 1) {
    console.error('[driver] 負のコントロール ' + label + ' の注入点が ' + hits + ' 箇所 (期待 1)。アンカーが腐っています:');
    console.error('         ' + file + '  ' + anchor.slice(0, 160));
    process.exit(3);
  }
  if (anchor === patch || anchor.length === patch.length) {
    console.error('[driver] ' + label + ' は置換前後が同一 / 同じバイト長です (起動時検算に落ちる形)');
    process.exit(3);
  }
  if (ONLY.length && ONLY.indexOf(tag) < 0) {
    console.log('[driver]   (' + tag + ' はアンカー健在・--only 指定により注入せず)');
    return;
  }
  const parts = FROZEN[file].toString('utf8').split(anchor);
  if (parts.length - 1 !== 1) {
    console.error('[driver] ' + label + ' は同 tag の先行変異にアンカーを食われました (' + (parts.length - 1) + ' 箇所)。');
    process.exit(3);
  }
  FROZEN[file] = Buffer.from(parts.join(patch), 'utf8');
  INJECTED.push(tag);
  console.log('[driver] ★ 負のコントロール ' + label + ' を注入しました (' + file + ')');
}

/* 変異 → 赤くなるべきラベルの担当表。
   ⚠⚠⚠ 机上で書いてはいけない。`--only <tag>` で 1 本ずつ走らせ、実際に赤くなった
     ラベルを見てから書き換える。標的以外の巻き添えは列挙しない (母集団が消えただけの
     「偽の赤」で空振りを隠せてしまう)。 */
const NEG_EXPECT = {
  pairoff:    ['(1a)', '(1h)', '(1i)'],
  nospread:   ['(1c)'],
  nearcaster: ['(1e)'],
  immunepair: ['(1d)'],
  heldpair:   ['(1e2)'],
  slot2:      ['(1a)', '(1f)'],
  oneroll:    ['(1b)'],
  popally:    ['(1g)', '(1h)'],
  dupline:    ['(0a)'],
  hardcode6:  ['(5a)'],
  switchdead: ['(4a)'],
  flavor1:    ['(3a)'],
};

if (NEGATIVE && !ONLY.length) {
  const { spawnSync } = require('child_process');
  const tags = Object.keys(NEG_EXPECT);
  const bad  = [];
  console.log('[driver] --negative (一括): ' + tags.join(',') + ' を 1 本ずつ順に走らせます'
    + '  ⚠ 同時注入は互いを覆い隠すので必ず 1 本ずつ');
  tags.forEach((tag, i) => {
    console.log('\n[driver] ══════════ ' + tag + ' ══════════');
    const a = [__filename, '--negative', '--only', tag, '--port', String(PORT + 1 + i)];
    if (HEADFUL) a.push('--headful');
    const b = arg('browser', null); if (b) a.push('--browser', b);
    const r = spawnSync(process.execPath, a, { stdio: 'inherit' });
    if (r.status !== 0) bad.push(tag + ' (exit ' + r.status + ')');
  });
  if (bad.length) { console.error('\n[driver] --negative NG: ' + bad.join(' , ')); process.exit(1); }
  console.log('\n[driver] --negative OK: ' + tags.length + ' 本すべて担当ラベルが赤くなりました (空振り 0)');
  process.exit(0);
}

if (NEGATIVE) {
  /* ── pairoff: 2 体目を選ばない (HOLD_PAIR_ON の分岐を偽にする) ───────────── */
  mutate('/index.html', 'pairoff (2 体目を選ばない = 分岐を常に偽へ)',
    '      if (HOLD_PAIR_ON) {',
    '      if (false) {   /* pairoff */');
  /* ── switchdead: 撤退スイッチを殺す (常に真) ──────────────────────────── */
  mutate('/index.html', 'switchdead (?holdpair=0 を無視して常に 2 体へ掛ける)',
    '      if (HOLD_PAIR_ON) {',
    '      if (true) {   /* switchdead */');
  /* ── nospread: 1 体目からの距離の上限を外す ──────────────────────────── */
  mutate('/index.html', 'nospread (within の判定を落とす = いくら離れていても 2 体目に選ぶ)',
    '          if (nd > opts.within) continue;',
    '          void 0;   /* nospread: within の判定を落とした */');
  /* ── nearcaster: 近さの基準を術者へ戻す (d = nd を落とす) ──────────────── */
  mutate('/index.html', 'nearcaster (2 体目の近さの基準を術者へ戻す)',
    '          d = nd;',
    '          void 0;   /* nearcaster: 近さの基準が術者のまま */');
  /* ── immunepair: 2 体目の選択でだけ免疫を除外しない ───────────────────── */
  mutate('/index.html', 'immunepair (2 体目の選択でだけアンデッド/ボスを除外しない)',
    '        if (holdPersonImmune(e)) continue;',
    '        if (holdPersonImmune(e) && !(opts && opts.near)) continue;   /* immunepair */');
  /* ── heldpair: 2 体目の選択でだけ金縛り中を除外しない ─────────────────── */
  mutate('/index.html', 'heldpair (2 体目の選択でだけ金縛り中の敵を除外しない)',
    '        if (hasStatus(e, "held")) continue;',
    '        if (hasStatus(e, "held") && !(opts && opts.near)) continue;   /* heldpair */');
  /* ── slot2: 対象ごとに枠を減らす (1 回 1 枚を崩す) ────────────────────── */
  mutate('/index.html', 'slot2 (対象ごとに呪文枠を減らす)',
    '        if (!t) continue;' + CRLF + '        const tDef = t.def;',
    '        if (!t) continue;' + CRLF
    + '        if (ally.spellSlots && skill._slotId && ally.spellSlots[skill._slotId] != null) '
    + 'ally.spellSlots[skill._slotId] = Math.max(0, ally.spellSlots[skill._slotId] - 1);   /* slot2 */' + CRLF
    + '        const tDef = t.def;');
  /* ── oneroll: 命中ロールを 1 回だけ引いて 2 体で共有する ──────────────── */
  mutate('/index.html', 'oneroll (命中ロールを 1 回だけ引く: 引く場所)',
    '      const atkBonus = spellAtkBonus(ally);' + CRLF + '      for (const hIdx of holdTargets) {',
    '      const atkBonus = spellAtkBonus(ally);' + CRLF
    + '      const __sharedRoll = d20();   /* oneroll */' + CRLF
    + '      for (const hIdx of holdTargets) {');
  mutate('/index.html', 'oneroll (命中ロールを 1 回だけ引く: 使う場所)',
    '        const natD20   = d20();',
    '        const natD20   = __sharedRoll;   /* oneroll: 2 体で共有 */');
  /* ── popally: 結果の吹き出しを術者の頭上へ出す (依頼書 §2-3 の罠) ──────── */
  mutate('/index.html', 'popally (NO EFFECT を術者の頭上へ)',
    '          showRollAtEnemy(hIdx, `<span class="label">NO EFFECT</span>金縛りは通じない`, "miss");',
    '          showRollAtAlly(ally, `<span class="label">NO EFFECT</span>金縛りは通じない`, "miss");   /* popally */');
  mutate('/index.html', 'popally (RESIST を術者の頭上へ)',
    '          showRollAtEnemy(hIdx,' + CRLF
    + '            `<span class="label">RESIST</span>d20(${natD20})+${atkBonus} vs AC ${effectiveEnemyAc(t)}`, "miss");',
    '          showRollAtAlly(ally,' + CRLF
    + '            `<span class="label">RESIST</span>d20(${natD20})+${atkBonus} vs AC ${effectiveEnemyAc(t)}`, "miss");   /* popally */');
  /* ── dupline: applyStatus の行を 2 本にする (依頼書 §2-4 の罠) ─────────── */
  mutate('/index.html', 'dupline (applyStatus(t,"held",…) の行を 2 本目として書き写す)',
    '          applyStatus(t, "held", skill.holdTurns);',
    '          applyStatus(t, "held", skill.holdTurns);' + CRLF
    + '          applyStatus(t, "held", skill.holdTurns);   /* dupline */');
  /* ── hardcode6: spread を 6 と直書きする ──────────────────────────────── */
  mutate('/index.html', 'hardcode6 (spread を 6 と直書きする = 射程から導出しない)',
    '          exclude: enemyIdx, near: t, within: Math.floor(rangeTiles / 2),',
    '          exclude: enemyIdx, near: t, within: 6,   /* hardcode6 */');
  /* ── flavor1: tavern.html の flavor だけ 1 体版のまま ─────────────────── */
  mutate('/tavern.html', 'flavor1 (酒場の説明文だけ 1 体版のまま = 2 ファイルの鏡が割れる)',
    'flavor: "敵2体まで 4ターン 金縛り (2体目は1体目の近く。アンデッド/ボスには無効)"',
    'flavor: "敵1体を 4ターン 金縛り (アンデッド/ボスには無効)"   /* flavor1 */');
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
        if (FROZEN[u]) { rs.setHeader('Content-Type', MIME['.html']); rs.end(FROZEN[u]); return; }
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
 * 集計
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pageErrors = [];

/* ══════════════════════════════════════════════════════════════════════════
 * ドライバ側の独立計算 (2 経路目)
 *   ⛔ pickHoldPersonTarget の戻り値を期待値にしない。置いた **オフセットと型** だけから
 *     「選ばれるべき添字」と「金縛りになるべき集合」を組み立てる。
 *   ⚠ ロールの消費順は本番と同じ = 免疫の相手では d20 を **引かない** (continue が前)。
 * ══════════════════════════════════════════════════════════════════════════ */
const IMMUNE_KEYS = { skeleton: true, goblinKing: true };   // アンデッド / ボス
function expectBoard(spec, env) {
  const spread = Math.floor(env.rangeTiles / 2);
  const units = spec.units;
  const first = spec.first || 0;
  const sel = [first];
  if (env.pairOn) {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < units.length; i++) {
      if (i === first) continue;
      const u = units[i];
      if (IMMUNE_KEYS[u.key]) continue;                 // 免疫
      if (u.preHeld) continue;                          // 既に金縛り
      if (Math.abs(u.off) > env.rangeTiles) continue;   // 術者 (off 0) からの射程
      const dn = Math.abs(u.off - units[first].off);    // 1 体目からの距離
      if (dn > spread) continue;
      if (dn < bestD) { bestD = dn; best = i; }         // 同距離なら添字の小さい方
    }
    if (best >= 0) sel.push(best);
  }
  const newHeld = [];
  let ri = 0;
  for (const si of sel) {
    const u = units[si];
    if (IMMUNE_KEYS[u.key]) continue;                   // NO EFFECT (ロールを引かない)
    const roll = spec.rolls[Math.min(ri, spec.rolls.length - 1)];
    ri++;
    if (roll !== 1) newHeld.push(si);                   // 20 = 命中 / 1 = 必ず抵抗
  }
  const finalHeld = [];
  for (let i = 0; i < units.length; i++)
    if (units[i].preHeld || newHeld.indexOf(i) >= 0) finalHeld.push(i);
  return { spread: spread, sel: sel, newHeld: newHeld, finalHeld: finalHeld, rolls: ri };
}
const setEq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const heldSetOf = (rec) => (rec.after || []).map((u, i) => (u.held ? i : -1)).filter((i) => i >= 0);

/* ══════════════════════════════════════════════════════════════════════════
 * ページ (合成盤面)
 * ══════════════════════════════════════════════════════════════════════════ */
const SEED_PARTY = [
  { classKey: 'warrior', isHero: true,  zone: 'front', name: null,   trait: null, line: null },
  { classKey: 'cleric',  isHero: false, zone: 'mid',   name: 'リタ', trait: null, line: null },
  { classKey: 'rogue',   isHero: false, zone: 'front', name: 'ロズ', trait: null, line: null },
];

async function openIndex(browser, qs, scen) {
  const page = await browser.newPage();
  const tag = 'index' + (qs || '');
  page.on('pageerror', (e) => pageErrors.push(tag + ' :: PAGEERROR ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    let url = ''; try { url = (m.location() && m.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(url)) return;   // ⚠ 除外はこの 1 本の URL だけに絞る
    pageErrors.push(tag + ' :: CONSOLE ' + m.text());
  });
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  /* ⚠ evaluateOnNewDocument は全ナビゲーションで再実行される。消去系はここへ置かない。 */
  await page.evaluateOnNewDocument((seed) => {
    try {
      sessionStorage.setItem('dragonfighters.currentScenario', seed.scen);
      sessionStorage.setItem('dragonfighters.partyMembers', JSON.stringify(seed.party));
      localStorage.setItem('dragonfighters.xp', String(seed.xp));
      localStorage.setItem('dragonfighters.prologueSeen', '1');
    } catch (e) {}
  }, { scen: scen || SCENARIO, party: SEED_PARTY, xp: 45000 });
  await page.goto('http://localhost:' + PORT + '/index.html' + (qs || ''),
    { waitUntil: 'domcontentloaded', timeout: 30000 });
  /* ⚠ 裸の識別子で待つ (classic script 直下の const/let は window に載らない)。 */
  await page.waitForFunction(
    "typeof allies !== 'undefined' && allies.length > 0"
    + " && typeof enemies !== 'undefined' && typeof applyStatus === 'function'"
    + " && typeof createEnemy === 'function' && typeof allyHoldPerson === 'function' && !!mapData",
    { timeout: 45000 });
  return page;
}

/* 盤面の据え付け。⭐ 演出だけを黙らせ、判定ロジックは本番のまま呼ぶ。 */
function installProbe() {
  /* 隔離レシピ (2026-06-08 に確立):
       gameOver=true         … 裏のオートバトルのラウンドループを止める
       encounterActive=false … combat-stall watchdog の発火条件を外す
       sleepMs → setTimeout(r,0) … 演出待ちを即時化
         (⛔ Promise.resolve() はマイクロタスク飢餓で CDP の evaluate が 180s で死ぬ) */
  gameOver = true;
  try { encounterActive = false; } catch (e) {}
  window.sleepMs = () => new Promise((r) => setTimeout(r, 0));
  try { window.moveEnemies = function () {}; } catch (e) {}
  /* ⭐ 演出だけを黙らせる。dfPlayCast は詠唱窓を await するだけの提示レイヤなので、
     即解決にしても判定 (命中ロール / 状態の付与 / 輪の生成) は 1 行も変わらない。
     ⛔ allyHoldPerson 自体は差し替えない —— 測りたいのはそれ。 */
  window.__hpCastCalls = 0;
  window.dfPlayCast = function () { window.__hpCastCalls++; return Promise.resolve(); };

  const TILE = TILE_SIZE;
  const FAR = -999999;
  const setUnit = (u, tx, ty) => {
    const s = (u.def && u.def.displaySize) || 96;
    u.x = tx * TILE + TILE / 2 - s / 2;
    u.y = ty * TILE + TILE / 2 - s / 2;
  };
  const cx = (u) => u.x + ((u.def && u.def.displaySize) || 96) / 2;
  const cy = (u) => u.y + ((u.def && u.def.displaySize) || 96) / 2;

  /* 横に連続した床が **13 マス以上** ある行を選ぶ (⛔ 絶対タイル座標を直書きしない =
     幾何が動いた日に「岩盤化」して母集団が黙って消える)。⭐ 13 = 依頼書 §8 の計測機構の指定
     (術者 tx0 + 敵 +9 まで置くので、余裕を含めて 13 マス取れる行だけを使う)。 */
  let lane = null, laneLen = 0, bestRun = 0;
  for (let ty = 1; ty < MAP_H - 1; ty++) {
    let run = 0;
    for (let tx = 1; tx < MAP_W - 1; tx++) {
      if (!isTileWall(tx, ty)) {
        run++;
        if (run > bestRun) bestRun = run;
        if (!lane && run >= 13) { lane = { ty: ty, tx0: tx - run + 1 }; laneLen = run; }
      } else run = 0;
    }
  }

  /* ★ installProbe の時点で盤面に立っている敵 = **部屋に元から居る敵**。
     ⛔ 添字でなく参照で持つ (盤面づくりが enemies に push しても指す先が動かない)。 */
  const roomEnemies = enemies.slice();

  /* 吹き出しは 1.3 秒で消えるので、後から DOM を読まずに **追加された瞬間**に採る。 */
  const pops = [];
  const mo = new MutationObserver((recs) => {
    for (const r of recs) for (const n of r.addedNodes) {
      if (!n || n.nodeType !== 1 || !n.classList || !n.classList.contains('rollPop')) continue;
      const lb = n.querySelector('.label');
      pops.push({
        label: lb ? String(lb.textContent || '').trim() : '',
        left: parseFloat(n.style.left) || 0,
        top: parseFloat(n.style.top) || 0,
        cls: n.className,
      });
    }
  });
  mo.observe(document.body, { childList: true });

  window.__hpPair = {
    info: function () {
      const sk = (typeof CLERIC_SKILLS === 'object') ? CLERIC_SKILLS['hold-person'] : null;
      return {
        lane: lane, laneLen: laneLen, bestRun: bestRun,
        mapW: MAP_W, mapH: MAP_H,
        pairOn: (typeof HOLD_PAIR_ON !== 'undefined') ? HOLD_PAIR_ON : null,
        rangeTiles: sk ? getRange(sk.range).tiles : null,
        holdTurns: sk ? sk.holdTurns : null,
        flavor: sk ? sk.flavor : null,
        mpCost: sk ? sk.mpCost : null,
        arity: (typeof pickHoldPersonTarget === 'function') ? pickHoldPersonTarget.length : null,
        ringMax: (typeof HOLD_RING_MAX !== 'undefined') ? HOLD_RING_MAX : null,
        clerics: allies.filter((a) => a.classKey === 'cleric').length,
        roomEnemies: roomEnemies.length,
      };
    },
    /* 1 盤面 = 1 詠唱。spec = { units:[{key, off, preHeld}], first, rolls:[…], mp } */
    board: async function (spec) {
      const sk = CLERIC_SKILLS['hold-person'];
      const cleric = allies.find((a) => a.classKey === 'cleric');
      if (!cleric || !lane) return { err: 'cleric/lane なし', hasCleric: !!cleric, lane: lane };
      /* ⭐ 輪のレジストリを空にしてから撃つ (HOLD_RING_MAX = 4 に当たって古い輪が消えるのを避ける)。
         ⛔ 盤面や状態には触らない = removeHoldRing は DOM とレジストリだけを落とす。 */
      let guard = 0;
      while (typeof holdRings !== 'undefined' && holdRings.length && guard++ < 64) removeHoldRing(0);

      cleric.alive = true;
      /* ⚠ 未開始の盤面では mp が 0 のことがある (ally.mp は Math.max(0,…) で下げ止まる)。 */
      cleric.mp = (spec.mp == null) ? 50 : spec.mp;
      /* 枠は本番の関数で開ける (Lv10 = 2 枠)。⛔ spellSlots を手で書かない。 */
      if (typeof initAllySpellSlots === 'function') initAllySpellSlots(cleric, 'cleric', 10, null);
      setUnit(cleric, lane.tx0, lane.ty);

      const rangeTiles = getRange(sk.range).tiles;
      /* ⭐ 退けの検算は「動かした体数」ではなく **「術者から射程以内に残っている元からの敵」**。 */
      const nearBefore = roomEnemies.filter((e) => e && e.alive
        && tileChebyshev(cx(cleric), cy(cleric), cx(e), cy(e)) <= rangeTiles).length;
      /* ⭐ 部屋に元から居る敵・前の盤面の敵・他の味方を退ける (⛔ alive は倒さない)。 */
      for (const a of allies) if (a !== cleric) { a.x = FAR; a.y = FAR; }
      for (const e of enemies) { e.x = FAR; e.y = FAR; }
      const nearAfter = roomEnemies.filter((e) => e && e.alive
        && tileChebyshev(cx(cleric), cy(cleric), cx(e), cy(e)) <= rangeTiles).length;
      const roomMinDist = roomEnemies.length
        ? Math.min.apply(null, roomEnemies.map((e) => tileChebyshev(cx(cleric), cy(cleric), cx(e), cy(e))))
        : null;

      /* 敵を新規に立てる。⚠ push の**直後に 1 回だけ** createEnemyDom (添字並列)。 */
      const made = [];
      for (const u of spec.units) {
        const idx = enemies.length;
        const e = createEnemy(u.key, lane.tx0 + u.off, lane.ty);
        enemies.push(e);
        createEnemyDom(idx, e.def, e.type);
        e.alive = true;
        e.maxHp = Math.max(e.maxHp || 0, 400); e.hp = e.maxHp;   // ⚠ 浄化 (低HP) の枝へ落ちないよう盛る
        if (u.preHeld) { applyStatus(e, 'held', sk.holdTurns); e.stunned = Math.max(e.stunned || 0, sk.holdTurns); }
        made.push(idx);
      }
      const durOf = (e) => {
        const s = (e.statusEffects || []).find((x) => x.id === 'held');
        return s ? s.duration : null;
      };
      const before = made.map((i) => ({ held: hasStatus(enemies[i], 'held'),
        stunned: enemies[i].stunned || 0, dur: durOf(enemies[i]) }));

      pops.length = 0;
      const slotBefore = (cleric.spellSlots || {})[sk._slotId];
      const mpBefore   = cleric.mp;
      const castBefore = window.__hpCastCalls;

      /* ⭐ 命中ロールを固定する (window.d20 の差し替え)。⛔ 撃ち直さない。必ず元へ戻す。 */
      const origD20 = window.d20;
      let k = 0;
      window.d20 = function () { const v = spec.rolls[Math.min(k, spec.rolls.length - 1)]; k++; return v; };
      let err = null;
      try { await allyHoldPerson(cleric, made[spec.first || 0]); }
      catch (e) { err = String((e && e.message) || e); }
      finally { window.d20 = origD20; }
      /* MutationObserver のコールバックを掃き出してから読む。 */
      await new Promise((r) => setTimeout(r, 0));

      let reg = null; try { reg = holdRings; } catch (e) { reg = null; }
      return {
        err: err, lane: lane, made: made,
        offs: spec.units.map((u) => u.off), keys: spec.units.map((u) => u.key),
        before: before,
        after: made.map((i) => ({ key: enemies[i].type, name: enemies[i].def.name,
          held: hasStatus(enemies[i], 'held'), stunned: enemies[i].stunned || 0, dur: durOf(enemies[i]) })),
        d20Calls: k,
        castCalls: window.__hpCastCalls - castBefore,
        slotBefore: slotBefore, slotAfter: (cleric.spellSlots || {})[sk._slotId],
        mpBefore: mpBefore, mpAfter: cleric.mp,
        rings: Array.isArray(reg) ? reg.length : null,
        ringOwners: Array.isArray(reg) ? reg.map((r) => made.indexOf(enemies.indexOf(r.unit))) : null,
        pops: pops.slice(),
        casterX: SX(cx(cleric)),
        unitX: made.map((i) => SX(cx(enemies[i]))),
        nearBefore: nearBefore, nearAfter: nearAfter, roomMinDist: roomMinDist,
        roomTotal: roomEnemies.length,
        clerics: allies.filter((a) => a.classKey === 'cleric').length,
      };
    },
  };
  return window.__hpPair.info();
}

/* ══════════════════════════════════════════════════════════════════════════
 * 実プレイ (§2) — ⭐ 記録だけ。合否に効くのは (0e) だけ。
 *   #50 verify_cone_cast の仕込みを流用 (遷移前に編成 / XP / 舞台を書き、?autoplay=30&diag=1)。
 *   ⛔ 本番 index.html は 1 バイトも触らない。window.allyHoldPerson を **包む**だけ。
 *   ⚠ 候補の判定はドライバが本番 pickHoldPersonTarget の 6 条件を同じ順で独立に写し、
 *     2 体目の条件 (1 体目から spread 以内) を足したもの。⛔ 本番の関数を呼んで期待値にしない。
 * ══════════════════════════════════════════════════════════════════════════ */
function installPlayHook() {
  window.__hpPlay = { rows: [], wrapped: false, depth: 0, err: null, d20Calls: 0 };
  const iv = setInterval(() => {
    try {
      if (typeof window.allyHoldPerson !== 'function' || window.allyHoldPerson.__hpWrapped) return;
      const orig = window.allyHoldPerson;
      const wrap = async function (ally, enemyIdx) {
        const P = window.__hpPlay;
        let rec = null;
        try {
          const sk = CLERIC_SKILLS['hold-person'];
          const rangeTiles = getRange(sk.range).tiles;
          const spread = Math.floor(rangeTiles / 2);
          const t0 = enemies[enemyIdx];
          let cand = 0, candMin = null;
          if (t0 && t0.alive && ally && ally.def) {
            const aCX = ally.x + ally.def.displaySize / 2, aCY = ally.y + ally.def.displaySize / 2;
            const fcx = t0.x + t0.def.displaySize / 2, fcy = t0.y + t0.def.displaySize / 2;
            for (let i = 0; i < enemies.length; i++) {
              if (i === enemyIdx) continue;
              const e = enemies[i];
              if (!e || !e.alive) continue;                       // (1) 死亡
              if (isEscortObjective(e)) continue;                 // (2) 護衛対象
              if (holdPersonImmune(e)) continue;                  // (3) 免疫
              if (hasStatus(e, 'held')) continue;                 // (4) 金縛り中
              const ecx = e.x + e.def.displaySize / 2, ecy = e.y + e.def.displaySize / 2;
              if (tileChebyshev(aCX, aCY, ecx, ecy) > rangeTiles) continue;   // (5) 射程
              if (!hasLineOfSight(aCX, aCY, ecx, ecy)) continue;              // (6) 視線
              const dn = tileChebyshev(fcx, fcy, ecx, ecy);                   // (7) 1 体目から spread 以内
              if (dn > spread) continue;
              cand++;
              if (candMin == null || dn < candMin) candMin = dn;
            }
          }
          const heldBefore = enemies.map((e) => !!(e && hasStatus(e, 'held')));
          rec = { scen: P.scen, arm: P.arm, run: P.run, first: enemyIdx,
            firstName: (t0 && t0.def) ? t0.def.name : '?', cand: cand, candMin: candMin,
            spread: spread, rangeTiles: rangeTiles,
            slotBefore: (ally.spellSlots || {})[sk._slotId] };
          /* 選ばれた対象 = 結果の吹き出しが出た敵 (HELD! / RESIST / NO EFFECT はすべて
             showRollAtEnemy を通る) = 2 経路目。⚠ 必ず元へ戻す。 */
          const origPop = window.showRollAtEnemy;
          const seen = [];
          if (P.depth === 0) {
            window.showRollAtEnemy = function (idx, html, type) {
              try {
                const m = String(html).match(/class="label">([^<]*)/);
                seen.push({ idx: idx, label: m ? m[1] : '' });
              } catch (e) {}
              return origPop.apply(this, arguments);
            };
          }
          P.depth++;
          let err = null;
          try { await orig.call(this, ally, enemyIdx); }
          catch (e) { err = String((e && e.message) || e); }
          finally {
            P.depth--;
            if (P.depth === 0) window.showRollAtEnemy = origPop;
          }
          const sel = [];
          for (const s of seen) if (sel.indexOf(s.idx) < 0) sel.push(s.idx);
          let newHeld = 0;
          for (let i = 0; i < enemies.length; i++)
            if (enemies[i] && hasStatus(enemies[i], 'held') && !heldBefore[i]) newHeld++;
          rec.slotAfter = (ally.spellSlots || {})[sk._slotId];
          rec.sel = sel.length;
          rec.newHeld = newHeld;
          rec.labels = seen.map((s) => s.label).join('/');
          rec.slotDrop = (rec.slotBefore != null && rec.slotAfter != null && rec.slotBefore > rec.slotAfter) ? 1 : 0;
          rec.err = err;
          P.rows.push(rec);
          return;
        } catch (e) {
          P.err = String((e && e.message) || e);
          if (rec) { rec.err = P.err; P.rows.push(rec); }
          return await orig.call(this, ally, enemyIdx);
        }
      };
      wrap.__hpWrapped = true;
      window.allyHoldPerson = wrap;
      window.__hpPlay.wrapped = true;
      clearInterval(iv);
    } catch (e) { window.__hpPlay.err = String((e && e.message) || e); }
  }, 20);
  /* ⭐ 装置: d20 が実際に回っていること (0 回なら「詠唱されなかった」と読み違える)。 */
  const ivd = setInterval(() => {
    try {
      if (typeof window.d20 !== 'function' || window.d20.__hpCounted) return;
      const od = window.d20;
      const nd = function () { window.__hpPlay.d20Calls++; return od.apply(this, arguments); };
      nd.__hpCounted = true;
      window.d20 = nd;
      clearInterval(ivd);
    } catch (e) {}
  }, 20);
}

async function playRun(browser, scen, arm, runNo) {
  const page = await browser.newPage();
  const tag = 'play:' + scen + (arm || '(素)');
  page.on('pageerror', (e) => pageErrors.push(tag + ' :: PAGEERROR ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    let url = ''; try { url = (m.location() && m.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(url)) return;
    const t = m.text();
    if (/\[DIAG\]\[stall\]/.test(t)) return;   // ⚠ 診断ログ (探索停滞) は本チケットと無関係
    pageErrors.push(tag + ' :: CONSOLE ' + t);
  });
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((seed) => {
    try {
      sessionStorage.setItem('dragonfighters.currentScenario', seed.scen);
      sessionStorage.setItem('dragonfighters.partyMembers', JSON.stringify(seed.party));
      localStorage.setItem('dragonfighters.xp', String(seed.xp));
      localStorage.setItem('dragonfighters.prologueSeen', '1');
    } catch (e) {}
  }, {
    scen: scen, xp: 45000,
    /* ⚠ partyMembers に level を書かない —— #69 項目1 は level:7 を書いたせいで xp の腕が効かず
       「Lv3 (枠 1 枚)」を一度も測れなかった。ここは xp に任せる。 */
    party: [
      { classKey: 'warrior', isHero: true,  zone: 'front', name: null,     trait: null, line: null },
      { classKey: 'cleric',  isHero: false, zone: 'mid',   name: 'リタ',   trait: null, line: null },
      { classKey: 'dwarf',   isHero: false, zone: 'front', name: 'ドルグ', trait: null, line: null },
      { classKey: 'mage',    isHero: false, zone: 'back',  name: 'ミラ',   trait: null, line: null },
    ],
  });
  await page.evaluateOnNewDocument(installPlayHook);
  const qs = '?autoplay=30&diag=1' + (arm || '');
  await page.goto('http://localhost:' + PORT + '/index.html' + qs,
    { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction("typeof allies !== 'undefined' && allies.length > 0", { timeout: 45000 });
  await page.evaluate((meta) => {
    window.__hpPlay.scen = meta.scen; window.__hpPlay.arm = meta.arm; window.__hpPlay.run = meta.run;
  }, { scen: scen, arm: arm ? 'retreat' : 'plain', run: runNo });
  await sleep(PLAY_SECS * 1000);
  const out = await page.evaluate(() => {
    const cl = allies.find((a) => a.classKey === 'cleric');
    return {
      rows: window.__hpPlay.rows, wrapped: window.__hpPlay.wrapped, err: window.__hpPlay.err,
      d20Calls: window.__hpPlay.d20Calls,
      eq: cl ? (cl.equippedSkills || []).slice() : null,
      slots: cl ? Object.assign({}, cl.spellSlots || {}) : null,
      lvl: cl ? cl.level : null,
      pairOn: (typeof HOLD_PAIR_ON !== 'undefined') ? HOLD_PAIR_ON : null,
    };
  });
  await page.close();
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
 * 本体
 * ══════════════════════════════════════════════════════════════════════════ */
(async () => {
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_holdpair_');
  const server = await startServer().catch((e) => {
    console.error('[driver] サーバを立てられません: ' + e.message); process.exit(2);
  });
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--user-data-dir=' + profile,
           '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
    protocolTimeout: 300000,
  });

  const boardLog = [];   // (1i) の母集団
  try {
    /* ══ §0 (0a) 配信バイトの逐語 ═══════════════════════════════════════════
       ⭐ 測るのは **実際に配信しているバイト** (変異込み)。⛔ ディスクを読み直さない。 */
    const idxSrc  = FROZEN['/index.html'].toString('utf8');
    const cSwitch = idxSrc.split('get("holdpair")').length - 1;
    const cHold   = idxSrc.split('applyStatus(t, "held", skill.holdTurns);').length - 1;
    const cRing   = idxSrc.split('spawnHoldRing(t);').length - 1;
    check('(0a) [装置] 配信 index.html に holdpair の判定が 1 箇所、applyStatus(t,"held",…) と '
      + 'spawnHoldRing(t) がそれぞれ 1 箇所 '
      + '(⚠ 2 箇所になると verify_hold_person の変異が exit 3 で黙って死ぬ = 依頼書 §2-4)',
      cSwitch === 1 && cHold === 1 && cRing === 1,
      'get("holdpair") ' + cSwitch + ' / applyStatus(t,"held",…) ' + cHold + ' / spawnHoldRing(t) ' + cRing);

    /* ══ 素の腕 ════════════════════════════════════════════════════════════ */
    const ix   = await openIndex(browser, '?diag=1');
    const info = await ix.evaluate(installProbe);
    console.log('[driver] 素 info = ' + JSON.stringify(info));
    if (NEGATIVE) console.log('[driver] ★ 変異ページが起動しました (注入 ' + INJECTED.join(',') + ')');

    const envPlain = { rangeTiles: info.rangeTiles, pairOn: info.pairOn };
    const run = async (page, id, spec, env) => {
      const rec = await page.evaluate((s) => window.__hpPair.board(s), spec);
      const exp = expectBoard(spec, env);
      boardLog.push({ id: id, spec: spec, env: env, rec: rec, exp: exp });
      if (rec.err) console.log('[driver] ⚠ 盤面 ' + id + ' で例外: ' + rec.err);
      return rec;
    };

    /* (0c) d20 の差し替えが効いている = 敵 1 体で [20] なら held / [1] なら held でない */
    const b20 = await run(ix, '0c-hit',  { units: [{ key: 'orc', off: 2 }], rolls: [20] }, envPlain);
    const b01 = await run(ix, '0c-miss', { units: [{ key: 'orc', off: 2 }], rolls: [1]  }, envPlain);
    check('(0c) [装置] window.d20 の差し替えが効いている = 敵 1 体の盤面で [20] なら held / [1] なら held でない '
      + '(⭐ これが無いと §1 の抵抗系が空振りで永久緑)',
      !!b20.after && b20.after[0] && b20.after[0].held === true
      && !!b01.after && b01.after[0] && b01.after[0].held === false
      && b20.d20Calls === 1 && b01.d20Calls === 1,
      '[20] held=' + (b20.after ? b20.after[0].held : '?') + ' (d20 ' + b20.d20Calls + ' 回) / '
      + '[1] held=' + (b01.after ? b01.after[0].held : '?') + ' (d20 ' + b01.d20Calls + ' 回)');

    /* (0b) 合成盤面の前提 */
    check('(0b) [装置] 連続床 13 マス以上の lane が在り、僧侶が 1 人・hold-person の枠 ≥ 1、'
      + '部屋に元から居る敵は撃つ前に全員が術者の射程外へ退いている '
      + '(⭐ 検算は「動かした体数」でなく **射程以内に残っている元からの敵 = 0**)',
      !!info.lane && info.laneLen >= 13 && info.clerics === 1
      && b20.slotBefore >= 1 && b20.roomTotal >= 1
      && b20.nearAfter === 0 && b20.roomMinDist > 13,
      'lane ' + JSON.stringify(info.lane) + ' 長さ ' + info.laneLen + ' (この舞台の最長 ' + info.bestRun + ') / '
      + '僧侶 ' + info.clerics + ' 人 / 枠 ' + b20.slotBefore + ' / 部屋の敵 ' + b20.roomTotal + ' 体 '
      + '(退ける前に射程内 ' + b20.nearBefore + ' 体 → 退けた後 ' + b20.nearAfter + ' 体 / 最短 ' + b20.roomMinDist + ' マス)');

    /* ══ §1 合成盤面 ═══════════════════════════════════════════════════════ */
    /* ⭐ (1a) と (4a) は **同じ assert 本体** を両腕へ当てる (撤退の腕だけ見る assert は
       実装が壊れていても緑になる = #5 セーブスロットの教訓)。 */
    const pairAssert = (rec, expectPair) => ({
      ok: !!rec.after && rec.after.length === 2
        && rec.after[0].held === true && rec.after[1].held === expectPair
        && rec.after[0].stunned === 4 && (rec.after[1].stunned === 4) === expectPair
        && rec.slotBefore - rec.slotAfter === 1
        && rec.mpBefore - rec.mpAfter === 7
        && rec.rings === (expectPair ? 2 : 1),
      detail: 'held=' + JSON.stringify(rec.after ? rec.after.map((u) => u.held) : null)
        + ' stunned=' + JSON.stringify(rec.after ? rec.after.map((u) => u.stunned) : null)
        + ' 枠 ' + rec.slotBefore + '→' + rec.slotAfter + ' / mp ' + rec.mpBefore + '→' + rec.mpAfter
        + ' / 輪 ' + rec.rings + ' 本 / d20 ' + rec.d20Calls + ' 回',
    });

    const b1a = await run(ix, '1a', { units: [{ key: 'orc', off: 2 }, { key: 'orc', off: 4 }], rolls: [20, 20] }, envPlain);
    const a1a = pairAssert(b1a, true);
    check('(1a) ★★ オーク A(+2) と B(+4) に d20=[20,20] → **2 体とも** held かつ stunned=4・輪 2 本、'
      + 'hold-person の枠はちょうど 1 減り、mp はちょうど 7 減る (2 体でも 1 回)',
      a1a.ok, a1a.detail);

    const b1b = await run(ix, '1b', { units: [{ key: 'orc', off: 2 }, { key: 'orc', off: 4 }], rolls: [20, 1] }, envPlain);
    check('(1b) ★ 同じ盤面で d20=[20,1] → A は held・B は held でない '
      + '(⭐ 命中ロールが対象ごとに独立 = d20 を 2 回引いている)',
      !!b1b.after && b1b.after.length === 2 && b1b.after[0].held === true
      && b1b.after[1].held === false && b1b.d20Calls === 2,
      'held=' + JSON.stringify(b1b.after ? b1b.after.map((u) => u.held) : null) + ' / d20 ' + b1b.d20Calls + ' 回');

    const b1c6 = await run(ix, '1c-6', { units: [{ key: 'orc', off: 2 }, { key: 'orc', off: 8 }], rolls: [20, 20] }, envPlain);
    const b1c7 = await run(ix, '1c-7', { units: [{ key: 'orc', off: 2 }, { key: 'orc', off: 9 }], rolls: [20, 20] }, envPlain);
    check('(1c) ★★ 上限: A(+2) から 6 マスの B(+8) は held になり、7 マスの B(+9) は held にならない '
      + '(⚠ +9 は術者から 9 マス = 射程 12 の内側なので、落ちているのは **1 体目からの距離** だけ)',
      !!b1c6.after && b1c6.after[1] && b1c6.after[1].held === true
      && !!b1c7.after && b1c7.after[1] && b1c7.after[1].held === false
      && b1c6.d20Calls === 2 && b1c7.d20Calls === 1,
      '6 マス先 held=' + (b1c6.after ? b1c6.after[1].held : '?') + ' (d20 ' + b1c6.d20Calls + ' 回) / '
      + '7 マス先 held=' + (b1c7.after ? b1c7.after[1].held : '?') + ' (d20 ' + b1c7.d20Calls + ' 回)');

    const b1d = await run(ix, '1d', {
      units: [{ key: 'orc', off: 2 }, { key: 'skeleton', off: 3 }, { key: 'goblinKing', off: 4 }, { key: 'orc', off: 5 }],
      rolls: [20, 20],
    }, envPlain);
    check('(1d) ★★ 免疫の除外: A(+2) / スケルトン(+3) / ゴブリンキング(+4) / オーク C(+5) → '
      + '2 体目は **C**。スケルトンとボスの stunned は 0 のまま',
      !!b1d.after && b1d.after.length === 4
      && b1d.after[0].held === true && b1d.after[3].held === true
      && b1d.after[1].held === false && b1d.after[2].held === false
      && b1d.after[1].stunned === 0 && b1d.after[2].stunned === 0,
      'held=' + JSON.stringify(b1d.after ? b1d.after.map((u) => u.held) : null)
      + ' stunned=' + JSON.stringify(b1d.after ? b1d.after.map((u) => u.stunned) : null)
      + ' 型=' + JSON.stringify(b1d.keys));

    const b1e = await run(ix, '1e', {
      units: [{ key: 'orc', off: 6 }, { key: 'orc', off: 3 }, { key: 'orc', off: 8 }], rolls: [20, 20],
    }, envPlain);
    check('(1e) ★★ 近さの基準は術者でなく **1 体目**: A(+6) / B(+3 = A から 3・術者から 3) / '
      + 'C(+8 = A から 2・術者から 8) → 2 体目は **C** '
      + '(⭐ 術者基準なら B が選ばれる = この 1 本だけが d = nd を守る)',
      !!b1e.after && b1e.after.length === 3
      && b1e.after[0].held === true && b1e.after[2].held === true && b1e.after[1].held === false,
      'held=' + JSON.stringify(b1e.after ? b1e.after.map((u) => u.held) : null)
      + ' (offs ' + JSON.stringify(b1e.offs) + ')');

    const b1e2 = await run(ix, '1e2', {
      units: [{ key: 'orc', off: 2 }, { key: 'orc', off: 3, preHeld: true }, { key: 'orc', off: 5 }], rolls: [20, 20],
    }, envPlain);
    check('(1e2) ★ 金縛り中の除外: A(+2) / B(+3 = 既に held) / C(+5) → 2 体目は **C** で、'
      + 'B の held の残りターンは詠唱の前後で同じ (⛔ 二重掛けしない)',
      !!b1e2.after && b1e2.after.length === 3
      && b1e2.after[0].held === true && b1e2.after[2].held === true
      && b1e2.after[1].held === true && b1e2.before[1].dur === b1e2.after[1].dur,
      'held=' + JSON.stringify(b1e2.after ? b1e2.after.map((u) => u.held) : null)
      + ' / B の held 残り ' + (b1e2.before ? b1e2.before[1].dur : '?') + ' → ' + (b1e2.after ? b1e2.after[1].dur : '?'));

    const b1f = await run(ix, '1f', { units: [{ key: 'orc', off: 2 }], rolls: [20] }, envPlain);
    check('(1f) 効く相手が 1 体だけの盤面でも撃つ = A が held・枠はちょうど 1 減る・輪 1 本',
      !!b1f.after && b1f.after.length === 1 && b1f.after[0].held === true
      && b1f.slotBefore - b1f.slotAfter === 1 && b1f.rings === 1,
      'held=' + (b1f.after ? b1f.after[0].held : '?') + ' / 枠 ' + b1f.slotBefore + '→' + b1f.slotAfter
      + ' / 輪 ' + b1f.rings + ' 本');

    /* (1g) 吹き出しは **その敵の頭上**。術者の頭上は SKILL 1 枚だけ (依頼書 §2-3 の罠)。 */
    const b1g = await run(ix, '1g', { units: [{ key: 'orc', off: 2 }, { key: 'orc', off: 4 }], rolls: [1, 1] }, envPlain);
    const near = (a, b) => Math.abs(a - b) <= 2;
    const resistPops = (b1g.pops || []).filter((p) => p.label === 'RESIST');
    const atCaster   = (b1g.pops || []).filter((p) => near(p.left, b1g.casterX));
    const resistX    = resistPops.map((p) => p.left).sort((x, y) => x - y);
    const wantX      = (b1g.unitX || []).slice().sort((x, y) => x - y);
    check('(1g) ★★ 結果の吹き出しは **その敵の頭上**: d20=[1,1] の 2 体盤面で RESIST が 2 枚あり、'
      + 'その left が A と B それぞれの画面中心 x に ±2px で一致。術者の中心 x の吹き出しは SKILL の 1 枚だけ',
      resistPops.length === 2 && wantX.length === 2
      && near(resistX[0], wantX[0]) && near(resistX[1], wantX[1])
      && atCaster.length === 1 && atCaster[0].label === 'SKILL',
      'RESIST ' + resistPops.length + ' 枚 left=' + JSON.stringify(resistX)
      + ' / 敵の中心 x=' + JSON.stringify(wantX)
      + ' / 術者 x=' + b1g.casterX + ' に居る吹き出し=' + JSON.stringify(atCaster.map((p) => p.label))
      + ' / 全吹き出し=' + JSON.stringify((b1g.pops || []).map((p) => p.label + '@' + Math.round(p.left))));

    /* (1h) 1 体目が免疫でも 2 体目は掛かる (#19 / 主人公の経路の無駄打ちを半分救う) */
    const b1h = await run(ix, '1h', {
      units: [{ key: 'goblinKing', off: 2 }, { key: 'orc', off: 4 }], rolls: [20],
    }, envPlain);
    const noEffPops = (b1h.pops || []).filter((p) => p.label === 'NO EFFECT');
    check('(1h) ★★ 1 体目が免疫 (ゴブリンキング +2) でも 2 体目 (オーク C +4) は held になり、'
      + 'ボスの stunned は 0 のまま。NO EFFECT の吹き出しは **ボスの頭上**',
      !!b1h.after && b1h.after.length === 2
      && b1h.after[0].held === false && b1h.after[0].stunned === 0 && b1h.after[1].held === true
      && noEffPops.length === 1 && near(noEffPops[0].left, (b1h.unitX || [])[0]),
      'held=' + JSON.stringify(b1h.after ? b1h.after.map((u) => u.held) : null)
      + ' / ボス stunned=' + (b1h.after ? b1h.after[0].stunned : '?')
      + ' / NO EFFECT ' + noEffPops.length + ' 枚 left=' + JSON.stringify(noEffPops.map((p) => p.left))
      + ' / ボスの中心 x=' + ((b1h.unitX || [])[0]));

    /* (5a) の素側 = 同じ +6 の盤面が **素では held** (spread 6) */
    const b5aP = await run(ix, '5a-plain+6', { units: [{ key: 'orc', off: 2 }, { key: 'orc', off: 6 }], rolls: [20, 20] }, envPlain);

    const flavorIdxPlain = await ix.evaluate(() => CLERIC_SKILLS['hold-person'].flavor);

    /* ══ §4 撤退の腕 ?holdpair=0 ═══════════════════════════════════════════ */
    const ix0    = await openIndex(browser, '?diag=1&holdpair=0');
    const info0  = await ix0.evaluate(installProbe);
    console.log('[driver] 撤退 info = ' + JSON.stringify(info0));
    const envOff = { rangeTiles: info0.rangeTiles, pairOn: info0.pairOn };
    const b4a    = await run(ix0, '4a', { units: [{ key: 'orc', off: 2 }, { key: 'orc', off: 4 }], rolls: [20, 20] }, envOff);
    const a4a    = pairAssert(b4a, false);
    check('(4a) ★★ ?holdpair=0 で (1a) と **同じ盤面・同じ assert 本体** を当てると「A だけ held・'
      + 'B は held でない」へ崩れる。枠は同じくちょうど 1 減る '
      + '(⭐ 撤退の腕だけ見る assert は実装が壊れていても緑になる)',
      info0.pairOn === false && a4a.ok, 'HOLD_PAIR_ON=' + info0.pairOn + ' / ' + a4a.detail);

    const flavorIdxOff = await ix0.evaluate(() => CLERIC_SKILLS['hold-person'].flavor);

    /* ══ §5 導出 ?dndrange=0 (long = 6 → spread = 3) ══════════════════════ */
    const ixr   = await openIndex(browser, '?diag=1&dndrange=0');
    const infoR = await ixr.evaluate(installProbe);
    console.log('[driver] dndrange=0 info = ' + JSON.stringify(infoR));
    const envR  = { rangeTiles: infoR.rangeTiles, pairOn: infoR.pairOn };
    const b5a3  = await run(ixr, '5a-legacy+5', { units: [{ key: 'orc', off: 2 }, { key: 'orc', off: 5 }], rolls: [20, 20] }, envR);
    const b5a4  = await run(ixr, '5a-legacy+6', { units: [{ key: 'orc', off: 2 }, { key: 'orc', off: 6 }], rolls: [20, 20] }, envR);
    check('(5a) ★★ spread は射程から導出されている: ?dndrange=0 (long=6 → spread=3) では '
      + 'A(+2) から 3 マスの B(+5) は held・4 マスの B(+6) は held でない。'
      + 'その **同じ +6 の盤面が素 (spread=6) では held** (⛔ 6 を直書きしていれば赤)',
      infoR.rangeTiles === 6 && info.rangeTiles === 12
      && !!b5a3.after && b5a3.after[1].held === true
      && !!b5a4.after && b5a4.after[1].held === false
      && !!b5aP.after && b5aP.after[1].held === true,
      'rangeTiles 素 ' + info.rangeTiles + ' / legacy ' + infoR.rangeTiles
      + ' -- legacy +5 held=' + (b5a3.after ? b5a3.after[1].held : '?')
      + ' / legacy +6 held=' + (b5a4.after ? b5a4.after[1].held : '?')
      + ' / 素 +6 held=' + (b5aP.after ? b5aP.after[1].held : '?'));

    /* ══ §0 (0d) dfPlayCast は 1 盤面 1 回 ═════════════════════════════════ */
    const badCast = boardLog.filter((b) => b.rec.castCalls !== 1);
    check('(0d) [装置] どの盤面でも詠唱で dfPlayCast がちょうど 1 回だけ増える '
      + '(= 詠唱経路を本当に通っている / 2 体でも演出は 1 回)',
      boardLog.length >= 12 && badCast.length === 0,
      '盤面 ' + boardLog.length + ' 枚 / 1 回でなかったもの ' + badCast.length + ' 枚'
      + (badCast.length ? ' = ' + JSON.stringify(badCast.map((b) => b.id + ':' + b.rec.castCalls)) : ''));

    /* ══ §1 (1i) 2 経路 ════════════════════════════════════════════════════ */
    const mism = boardLog.filter((b) => !setEq(heldSetOf(b.rec), b.exp.finalHeld));
    check('(1i) ★★★ 2 経路: 全 ' + boardLog.length + ' 盤面で、held になった敵の集合が '
      + '**ドライバが配置と型から独立に計算した集合** と完全一致 '
      + '(⛔ pickHoldPersonTarget の戻り値を期待値にしていない)',
      boardLog.length >= 12 && mism.length === 0,
      mism.length === 0
        ? '一致 ' + boardLog.length + ' 枚 (例: '
          + boardLog.slice(0, 3).map((b) => b.id + ' 期待' + JSON.stringify(b.exp.finalHeld)).join(' , ') + ')'
        : '不一致 ' + mism.length + ' 枚 = ' + JSON.stringify(mism.map((b) => ({
            id: b.id, act: heldSetOf(b.rec), exp: b.exp.finalHeld, offs: b.rec.offs, keys: b.rec.keys }))));

    /* ══ §3 文言 (2 ファイル × 2 腕) ══════════════════════════════════════ */
    const tavFlavor = {};
    for (const qs of ['', '?holdpair=0']) {
      const tp = await browser.newPage();
      tp.on('pageerror', (e) => pageErrors.push('tavern' + qs + ' :: PAGEERROR ' + e.message));
      tp.on('console', (m) => {
        if (m.type() !== 'error') return;
        let url = ''; try { url = (m.location() && m.location().url) || ''; } catch (e) {}
        if (/\/favicon\.ico$/.test(url)) return;
        pageErrors.push('tavern' + qs + ' :: CONSOLE ' + m.text());
      });
      await tp.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
      await tp.goto('http://localhost:' + PORT + '/tavern.html' + qs, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await tp.waitForFunction("typeof CLERIC_SKILLS_UI !== 'undefined'", { timeout: 30000 });
      tavFlavor[qs || 'plain'] = await tp.evaluate(
        () => (CLERIC_SKILLS_UI.filter((s) => s.id === 'hold-person')[0] || {}).flavor);
      await tp.close();
    }
    const has2   = (s) => !!s && s.indexOf('2体') >= 0;
    const hasOne = (s) => !!s && s.indexOf('敵1体を') >= 0;
    check('(3a) ★ 文言: 素では index / tavern の **どちらも** 「2体」を含み「敵1体を」を含まない。'
      + '?holdpair=0 では **どちらも**「敵1体を」を含む (2 ファイル × 2 腕)',
      has2(flavorIdxPlain) && !hasOne(flavorIdxPlain)
      && has2(tavFlavor.plain) && !hasOne(tavFlavor.plain)
      && hasOne(flavorIdxOff) && hasOne(tavFlavor['?holdpair=0']),
      'index 素 = ' + JSON.stringify(flavorIdxPlain) + ' / tavern 素 = ' + JSON.stringify(tavFlavor.plain)
      + ' // index 撤退 = ' + JSON.stringify(flavorIdxOff)
      + ' / tavern 撤退 = ' + JSON.stringify(tavFlavor['?holdpair=0']));

    /* ══ §2 実プレイ (記録だけ) ════════════════════════════════════════════ */
    if (NEGATIVE) {
      pending('(0e) 実プレイの記録', '--negative では実プレイを走らせない (12 本 × 15 分になるため)');
      pending('(2a) 実プレイの総括', '--negative では実プレイを走らせない');
      pending('(2b) 候補が居たのに 1 体だった件数', '--negative では実プレイを走らせない');
    } else if (NOPLAY) {
      check('(0e) [装置] 実プレイ (素の腕) の記録が空でない', false,
        '⚠ --noplay が指定されました (開発用)。実プレイの証拠なしに緑を名乗らせない');
      pending('(2a) 実プレイの総括', '--noplay');
      pending('(2b) 候補が居たのに 1 体だった件数', '--noplay');
    } else {
      const rows = [];
      const runMeta = [];
      for (const armQs of ['', '&holdpair=0']) {
        for (const scen of PLAY_MAPS) {
          for (let r = 1; r <= PLAY_RUNS; r++) {
            const t0 = Date.now();
            const out = await playRun(browser, scen, armQs, r);
            const secs = ((Date.now() - t0) / 1000).toFixed(1);
            runMeta.push({ scen: scen, arm: armQs ? 'retreat' : 'plain', run: r, wrapped: out.wrapped,
              casts: out.rows.length, d20: out.d20Calls, eq: out.eq, slots: out.slots, lvl: out.lvl,
              pairOn: out.pairOn, err: out.err, secs: secs });
            console.log('[driver]   実プレイ ' + scen + ' / ' + (armQs ? 'retreat' : 'plain') + ' #' + r
              + ' → 包み=' + out.wrapped + ' 詠唱 ' + out.rows.length + ' 回 / d20 ' + out.d20Calls + ' 回 / '
              + '僧侶 Lv' + out.lvl + ' 枠 ' + JSON.stringify(out.slots) + ' / ' + secs + ' 秒');
            for (const row of out.rows) rows.push(row);
          }
        }
      }
      /* TSV は repo ではなく temp へ (⛔ 検証の副産物をリポジトリに置かない)。 */
      const tsvPath = path.join(os.tmpdir(), 'df_holdpair_play_' + Date.now() + '.tsv');
      const cols = ['scen', 'arm', 'run', 'first', 'firstName', 'cand', 'candMin', 'sel', 'newHeld',
        'slotBefore', 'slotAfter', 'slotDrop', 'spread', 'rangeTiles', 'labels', 'err'];
      const tsv = [cols.join('\t')].concat(rows.map((r) => cols.map((c) => (r[c] == null ? '' : String(r[c]))).join('\t')));
      try { fs.writeFileSync(tsvPath, tsv.join('\n') + '\n', 'utf8'); } catch (e) {}
      console.log('\n[driver] ── §2 実プレイの記録 (⛔ 合否には使わない) ─────────────────');
      console.log('[driver] TSV = ' + tsvPath + '  (' + rows.length + ' 行)');
      tsv.forEach((l) => console.log('[play] ' + l));

      const plain = rows.filter((r) => r.arm === 'plain');
      const retre = rows.filter((r) => r.arm === 'retreat');
      const summarize = (rs, label) => {
        if (!rs.length) { console.log('[driver] ' + label + ': 詠唱 0 回'); return; }
        const pair = rs.filter((r) => r.sel >= 2).length;
        const avgHeld = rs.reduce((s, r) => s + (r.newHeld || 0), 0) / rs.length;
        const candN = rs.filter((r) => r.cand > 0).length;
        /* ⭐ 率の重み付けを **明記**する (#68 の教訓): 合算 = 全舞台の分子/分母を足す /
           マップ平均 = 舞台ごとの率を単純平均。走行数を増やすと合算は走行の多い舞台へ寄る。 */
        const byMap = {};
        for (const r of rs) {
          byMap[r.scen] = byMap[r.scen] || { n: 0, pair: 0, cand: 0, held: 0 };
          byMap[r.scen].n++;
          if (r.sel >= 2) byMap[r.scen].pair++;
          if (r.cand > 0) byMap[r.scen].cand++;
          byMap[r.scen].held += (r.newHeld || 0);
        }
        const keys = Object.keys(byMap);
        const avgOf = (f) => keys.reduce((s, k) => s + f(byMap[k]), 0) / keys.length;
        console.log('[driver] ' + label + ': 詠唱 ' + rs.length + ' 回'
          + ' / 2 体に掛けた割合 (合算) ' + (100 * pair / rs.length).toFixed(1) + '%'
          + ' (マップ平均 ' + (100 * avgOf((m) => m.pair / m.n)).toFixed(1) + '%)'
          + ' / 1 詠唱あたりの平均 held 体数 (合算) ' + avgHeld.toFixed(2)
          + ' (マップ平均 ' + avgOf((m) => m.held / m.n).toFixed(2) + ')'
          + ' / spread 以内に候補が居た割合 (合算) ' + (100 * candN / rs.length).toFixed(1) + '%'
          + ' (マップ平均 ' + (100 * avgOf((m) => m.cand / m.n)).toFixed(1) + '%)');
        keys.forEach((k) => console.log('[driver]     ' + k + ': 詠唱 ' + byMap[k].n
          + ' / 2 体 ' + byMap[k].pair + ' / 候補あり ' + byMap[k].cand + ' / held 合計 ' + byMap[k].held));
      };
      summarize(plain, '素 (plain)');
      summarize(retre, '撤退 (?holdpair=0)');
      const miss2b = plain.filter((r) => r.cand > 0 && r.sel === 1);
      console.log('[driver] (2b) 素の腕で「候補が居たのに対象が 1 体だった」詠唱 = ' + miss2b.length + ' 件'
        + (miss2b.length ? ' -- ' + JSON.stringify(miss2b.map((r) => ({ scen: r.scen, cand: r.cand, min: r.candMin, labels: r.labels }))) : '')
        + '  (⚠ プローブは詠唱**前**に数え、実装は dfPlayCast 2500ms **後**に選ぶ差を拾う。⛔ 件数で合否を決めない)');
      console.log('[driver] 走行メタ = ' + JSON.stringify(runMeta));
      console.log('[driver] ────────────────────────────────────────────────\n');

      const castsPlain = plain.filter((r) => r.slotDrop === 1).length;
      const eqOk = runMeta.filter((m) => m.arm === 'plain').every((m) => m.eq && m.eq.indexOf('hold-person') >= 0);
      check('(0e) [装置] 実プレイ (素の腕) で allyHoldPerson による **枠の減った詠唱が合計 1 回以上**、'
        + 'かつ僧侶の equippedSkills に hold-person が入っている '
        + '(⭐ 記録が空のまま「記録だけ」で緑にしない)',
        castsPlain >= 1 && eqOk,
        '素の腕 ' + plain.length + ' 詠唱 (うち枠が減った ' + castsPlain + ' 回) / '
        + '包み ' + runMeta.filter((m) => m.wrapped).length + '/' + runMeta.length + ' 走行 / '
        + 'equippedSkills に hold-person = ' + eqOk);
      check('(2a) 実プレイの記録が TSV に残り、素と撤退の両腕が走っている '
        + '(⛔ 率の**閾値**は測らない = 依頼書 §8「測らないこと」。総括は上のログ / §12 へ)',
        rows.length >= 1 && runMeta.length === 2 * PLAY_MAPS.length * PLAY_RUNS,
        rows.length + ' 詠唱 / ' + runMeta.length + ' 走行 (素 ' + plain.length + ' / 撤退 ' + retre.length + ' 詠唱) / TSV=' + tsvPath);
      check('(2b) 「候補が居たのに 1 体だった」件数を記録した (⛔ 件数で合否を決めない)',
        true, miss2b.length + ' 件 / 素 ' + plain.length + ' 詠唱');
    }

    check('(0f) ページエラー / console error が 0 件 (favicon の 404 と [DIAG][stall] は除外済み)',
      pageErrors.length === 0, pageErrors.slice(0, 6).join('  |  ') || '(なし)');

  } catch (e) {
    console.error('\n[driver] FATAL ' + String((e && e.stack) || e));
    try { await browser.close(); } catch (e2) {}
    try { server.close(); } catch (e2) {}
    process.exit(2);
  }

  await browser.close();
  server.close();

  /* ══ 集計 ══════════════════════════════════════════════════════════════ */
  const passed   = results.filter((r) => r.ok).length;
  const pendingN = results.filter((r) => r.pending).length;
  const failed   = results.filter((r) => !r.ok && !r.pending).length;
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  ' + passed + '/' + results.length + ' PASSED   FAILED ' + failed + '   PENDING ' + pendingN);
  if (failed) {
    console.log('  --- FAILED ---');
    results.filter((r) => !r.ok && !r.pending).forEach((r) => console.log('    ' + r.name + '  -- ' + r.detail));
  }
  console.log('══════════════════════════════════════════════════════════');

  if (NEGATIVE && ONLY.length) {
    const tag = ONLY[0];
    const want = NEG_EXPECT[tag] || [];
    const red = new Set(results.filter((r) => !r.ok && !r.pending)
      .map((r) => (r.name.match(/^\([0-9a-z-]+\)/) || [''])[0]));
    const miss = want.filter((w) => !red.has(w));
    console.log('[driver] --negative ' + tag + ': 担当=' + want.join(',')
      + ' / 実際に赤くなった=' + Array.from(red).join(','));
    if (miss.length) {
      console.error('[driver] ✗ ' + tag + ' の担当ラベルが赤くなりませんでした (空振り): ' + miss.join(','));
      process.exit(1);
    }
    console.log('[driver] ✓ ' + tag + ' OK');
    process.exit(0);
  }
  process.exit(failed ? 1 : 0);
})();
