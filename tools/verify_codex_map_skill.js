#!/usr/bin/env node
/* tools/verify_codex_map_skill.js — 実装依頼書 #24 の受入条件
 *
 * ■ 何を測るか
 *   測るのは「スキルが在ること」ではなく **スキルが主張していることが本当か**。
 *   ⛔ SKILL.md の文字列一致だけで緑にしない — それは写経の検査であって作法の検査ではない。
 *   中心は §1: `--fit` が **既存台帳 GRIDS の 6 数値を素材から復元できるか**。
 *   期待値はドライバに直書きせず、`make_grid_map.py` から GRIDS を読み出して突き合わせる
 *   (⭐ 2 経路。片方の写経にしない)。
 *
 * ■ ブラウザを使わない
 *   本チケットは DOM を 1 バイトも触らないので、child_process で py を回すだけ。
 *
 * ■ 使い方
 *   node tools/verify_codex_map_skill.js               素 (PASSED / FAILED / **PENDING**)
 *   node tools/verify_codex_map_skill.js --negative    負のコントロール (赤くならなければ exit 1)
 *   node tools/verify_codex_map_skill.js --mutate fitceil   変異を 1 本だけ載せて素の節を出す
 *
 * ■ 変異は**ファイルのコピー**へ注入する (Python なので実行時注入ができない)
 *   ⛔ 本番ファイルを書き換えて戻す方式は採らない (中断で壊れる)。
 *   ⚠ コピーは <tmp>/mut_<key>/ に置くが、その際 ROOT を**絶対パスへ固定**する。
 *     これをしないと OUT_DIR が <tmp>/assets を指してしまい、変異 fitwrite が
 *     「本番の assets/ を書き換える」欠陥を再現できない (= 永久に空振り)。
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const flag = (n) => argv.includes('--' + n);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const NEGATIVE = flag('negative');
const MUTATE = arg('mutate', null);

const MGM_REL = 'tools/make_grid_map.py';
const SKILL_REL = '.claude/skills/codex-map-request';
const REFS = ['map-brief-template.md', 'grid-fit-recipe.md', 'mask-authoring.md'];
const KEY_PHLAN = 'phlan-harbor';
const KEY_MINE = 'mine-entrance';

/* 探索中心。⭐ 「素材の幅 ÷ ざっと数えたマス数」= 1536 / 33 = 46.55。
 * ⚠ 33 は台帳の cells だが、ここでは **人が目分量で数えた概数**の代役として使っている
 *   (±8% の窓は 1 マス数え違えても入るので 32 でも 34 でも同じ答えに落ちる)。 */
const FIT_CENTER_MINE = 46.55;

/* 許容差の根拠 (2026-08-26 実測)
 *   (1a) --tile 64 = 台帳を測ったときと同じ中心なので **6/6 が完全一致**した
 *        (dT 0.000 / dPh 0.00)。だから依頼書どおり厳しく締める。
 *   (1b) 中心が 46.55 と違うため粗探索の着地点がわずかに動く。実測 dT <= 0.014 /
 *        dPh <= 0.15 (素材の格子がそもそも完全な等間隔ではない)。⛔ ここを 0.01 に
 *        締めると「素材に存在しない精度」を要求することになる。 */
const TOL_1A = { period: 0.01, phase: 0.05 };
const TOL_1B = { period: 0.02, phase: 0.20 };

// ══════════════════════════════════════════════════════════════════════════════
// 変異 (依頼書 §8 の表)
//   from / to  … コピーへの 1 行置換。⚠ **ちょうど 1 箇所**ヒットが起動時の条件。
//   need       … 変異ごとに採る測定 (⭐ 担当の節が読める最小限。全部採ると 3 倍遅い)。
//   evaluable  … その測定で **実際に評価できる** assert。⛔ 測っていない節を書かない。
//   allowRed   … targets 以外で **赤くなるのが正しい**節。
// ══════════════════════════════════════════════════════════════════════════════
const MUTATIONS = {
  fitcenter: {
    file: MGM_REL, targets: ['1b'], need: ['fitPhlan', 'fitMine'],
    evaluable: ['1a', '1b', '2a'], allowRed: [],
    from: '    center = around if around is not None else (float(tile) if tile else None)',
    to: '    center = float(tile) if tile else around   # mut-fitcenter 探索中心を tile に固定',
    why: '⭐⭐⭐ 依頼書 §2-2 の事故の構造そのもの。--tile は「焼き上がりの 1 マス px」で '
      + '**素材の周期ではない** (台帳 4 件のうち 3 件で一致しない)。tile を探索中心に '
      + '固定すると周期 45.70 の廃坑入口は 64px 付近に張り付いて永久に測れなくなる。'
      + '⚠ 港町 (63.945) は tile 64 の窓にたまたま入るので (1a) は緑のまま = '
      + '**1 素材だけで測ると永久に気づけない**。',
  },
  fitceil: {
    file: MGM_REL, targets: ['2a'], need: ['fitPhlan', 'fitMine'],
    evaluable: ['1a', '1b', '2a'], allowRed: ['1a'],
    from: '        n = int((len(resp) - phase) // period)   # ⚠ round() にしない (負のコントロール fitceil)',
    to: '        n = int(round((len(resp) - phase) / period))  # mut-fitceil 切り捨てを四捨五入へ',
    why: '⭐ 依頼書 §2-4 罠 B の再現。1536x1024 の素材は 24x16 マスに見えるが、位相と周期の '
      + '実測値から取れるのは 23x15。切り捨てを四捨五入へ変えると横が 15.78 → 16 になり、'
      + '**素材からはみ出す切り出し**を台帳へ書くことになる。'
      + '⚠ 縦は 23.49 なので四捨五入でも 23 のまま = **片方の軸だけでは検出できない**。',
  },
  fitwrite: {
    file: MGM_REL, targets: ['1c'], need: ['fitPhlan'],
    evaluable: ['1a', '1c', '2a'], allowRed: [],
    from: '    # ⛔ --fit は読むだけ。ここで bake() を呼ばない (負のコントロール fitwrite が機械証明)',
    to: '    bake(GRIDS["phlan-harbor"], 64, OUT_DIR, 82, "jpeg")  # mut-fitwrite ついでに焼く親切',
    why: '「測るだけのつもりが書いていた」の再現。⚠ 焼き直しの中身は同じバイトなので '
      + '**git status は clean のまま**で、気づけるのは mtime だけ。'
      + '⭐ だから (1c) はファイル名 + サイズ + mtime の 3 点で見ている。',
  },
  toltweak: {
    file: MGM_REL, targets: ['3c'], need: [],
    evaluable: ['0a', '0b', '3c', '4a', '4b'], allowRed: [],
    from: 'TOL_SCORE_RATIO = 0.70     # 「そもそも格子を捉えているか」の門番 (精度は上の 2 本が見る)',
    to: 'TOL_SCORE_RATIO = 0.40   # mut-toltweak 閾値の無断緩和',
    why: '閾値の無断緩和。⭐ (3c) は「ドライバに書いた数」ではなく '
      + '**スキルの references/grid-fit-recipe.md に書いた数**と本番コードを突き合わせる '
      + '2 経路なので、コードだけ緩めると必ず食い違う (作法と実装のドリフトも同時に捕まる)。',
  },
  orphanref: {
    file: SKILL_REL + '/SKILL.md', targets: ['4b'], need: [],
    evaluable: ['2b', '4a', '4b'], allowRed: [],
    from: '| 4 | MASK を書く | **`references/mask-authoring.md`** |',
    to: '| 4 | MASK を書く | **`references/mask-authoring-v2.md`** |',
    why: 'スキルの参照先を 1 本壊す。⚠ 依頼書は「リンクを 1 本消す → 孤児が 1 件」と '
      + '書いていたが、SKILL.md は各 reference を **2 箇所から**参照しているので '
      + '1 本消しても孤児にならない (2026-08-26 実測)。よって「実在しないファイル名へ壊す」'
      + 'に変えてある。(4b) はリンク切れと孤児の両方を見ているのでどちらでも赤くなる。',
  },
};
const MUT_ORDER = Object.keys(MUTATIONS);
if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) {
  console.error('[drv] 未知の変異: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
  process.exit(2);
}

// ══════════════════════════════════════════════════════════════════════════════
// 判定 (PASSED / FAILED / PENDING の 3 値)
// ══════════════════════════════════════════════════════════════════════════════
const results = [];
function check(name, cond, detail) {
  results.push({ name: name, state: cond ? 'PASSED' : 'FAILED', detail: detail || '' });
  console.log('  ' + (cond ? 'PASSED ' : 'FAILED ') + name + (detail ? '  — ' + detail : ''));
}
function pending(name, why) {
  results.push({ name: name, state: 'PENDING', detail: why || '' });
  console.log('  **PENDING** ' + name + (why ? '  — ' + why : ''));
}
let step = 0;
function mark(msg) { console.log('\n[drv] ' + (++step) + ' ' + msg); }

// ══════════════════════════════════════════════════════════════════════════════
// python の呼び出し
// ══════════════════════════════════════════════════════════════════════════════
let PY = null;
function pyExe() {
  if (PY) return PY;
  for (const cand of ['py', 'python']) {
    try { execFileSync(cand, ['-c', 'pass'], { stdio: 'ignore' }); PY = cand; return PY; } catch (e) { /* 次を試す */ }
  }
  throw new Error('py / python が見つかりません');
}
function runPy(args) {
  try {
    const out = execFileSync(pyExe(), args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    return { code: 0, out: out, err: '' };
  } catch (e) {
    return { code: (e.status === undefined ? -1 : e.status), out: (e.stdout || ''), err: (e.stderr || String(e.message)) };
  }
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dfmapskill-'));
function tmpScript(name, body) {
  const p = path.join(TMP, name);
  fs.writeFileSync(p, body, 'utf8');
  return p;
}

/* GRIDS と定数をモジュールから読み出す。⭐ 期待値の写経を避ける唯一の口。
 * ⚠ ensure_ascii=True — 素材名が日本語なので、コンソール既定が cp932 でも壊れない形で渡す。 */
const READ_PY = tmpScript('read_mod.py', [
  '# -*- coding: utf-8 -*-',
  'import importlib.util, json, os, sys',
  'spec = importlib.util.spec_from_file_location("mgm", sys.argv[1])',
  'm = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)',
  'g = {}',
  'for k, s in m.GRIDS.items():',
  '    g[k] = {"src": s["src"], "out": s["out"], "tile": s["tile"],',
  '            "phase": list(s["phase"]), "period": list(s["period"]), "cells": list(s["cells"]),',
  '            "src_abs": os.path.join(m.SRC_DIR, s["src"]),',
  '            "src_exists": os.path.exists(os.path.join(m.SRC_DIR, s["src"]))}',
  'print("@@JSON@@" + json.dumps({',
  '    "grids": g, "src_dir": m.SRC_DIR, "out_dir": m.OUT_DIR, "root": m.ROOT,',
  '    "consts": {"DEFAULT_TILE": m.DEFAULT_TILE, "TOL_DRIFT_WORLD": m.TOL_DRIFT_WORLD,',
  '               "TOL_PHASE_WORLD": m.TOL_PHASE_WORLD, "TOL_SCORE_RATIO": m.TOL_SCORE_RATIO},',
  '}, ensure_ascii=True))',
].join('\n'));

/* 台帳の全件を焼き直して assets/ の現物と SHA-256 を突き合わせる。
 * ⭐ 「着手前に控えた sha」ではなく **コミット済みの納品物そのもの**を基準にする
 *   (2026-08-26 実測: 焼き直しは assets/ の 4 枚とバイト一致した)。 */
const BAKE_PY = tmpScript('bake_all.py', [
  '# -*- coding: utf-8 -*-',
  'import importlib.util, hashlib, json, os, sys',
  'from PIL import Image',
  'spec = importlib.util.spec_from_file_location("mgm", sys.argv[1])',
  'm = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)',
  'out_dir = sys.argv[2]',
  'def sha(p):',
  '    return hashlib.sha256(open(p, "rb").read()).hexdigest()',
  'res = {}',
  'for k, s in m.GRIDS.items():',
  '    ok = m.bake(s, s["tile"], out_dir, 82, "jpeg")',
  '    fresh = os.path.join(out_dir, s["out"] + ".jpg")',
  '    asset = os.path.join(m.ROOT, "assets", s["out"] + ".jpg")',
  '    row = {"verify_ok": bool(ok), "sha_fresh": sha(fresh), "asset_exists": os.path.exists(asset)}',
  '    if row["asset_exists"]:',
  '        row["sha_asset"] = sha(asset)',
  '        im = Image.open(asset)',
  '        row["asset_wh"] = [im.width, im.height]',
  '    res[k] = row',
  'print("@@JSON@@" + json.dumps(res, ensure_ascii=True))',
].join('\n'));

function jsonFrom(r, label) {
  const line = (r.out || '').split(/\r?\n/).filter(l => l.indexOf('@@JSON@@') === 0)[0];
  if (!line) throw new Error(label + ' の JSON が取れない (exit=' + r.code + '): ' + (r.err || r.out).slice(0, 400));
  return JSON.parse(line.slice('@@JSON@@'.length));
}

// ══════════════════════════════════════════════════════════════════════════════
// 測定
// ══════════════════════════════════════════════════════════════════════════════
const ASSETS_DIR = path.join(ROOT, 'assets');
function snapshotAssets() {
  return fs.readdirSync(ASSETS_DIR).sort().map(n => {
    const st = fs.statSync(path.join(ASSETS_DIR, n));
    return n + '|' + st.size + '|' + st.mtimeMs;
  });
}

/* --fit の出力を読む。⭐ 読むのは「GRIDS へ貼る形」の 3 行 =
 *   recipe が「そのまま貼れ」と書いている当のテキスト。 */
function parseFit(out) {
  const head = out.match(/格子フィット:.*?(\d+)x(\d+)\s*$/m);
  const ph = out.match(/"phase":\s*\(([-\d.]+),\s*([-\d.]+)\)/);
  const pe = out.match(/"period":\s*\(([-\d.]+),\s*([-\d.]+)\)/);
  const ce = out.match(/"cells":\s*\((\d+),\s*(\d+)\)/);
  return {
    wh: head ? [parseInt(head[1], 10), parseInt(head[2], 10)] : null,
    phase: ph ? [parseFloat(ph[1]), parseFloat(ph[2])] : null,
    period: pe ? [parseFloat(pe[1]), parseFloat(pe[2])] : null,
    cells: ce ? [parseInt(ce[1], 10), parseInt(ce[2], 10)] : null,
  };
}
function runFit(env, srcAbs, extra) {
  const r = runPy([env.mgm, '--fit', srcAbs].concat(extra));
  return { code: r.code, out: r.out, err: r.err, parsed: parseFit(r.out) };
}

function readDocs(env) {
  const skillMd = path.join(env.skill, 'SKILL.md');
  const d = { skillExists: fs.existsSync(skillMd), skill: '', refs: {}, refFiles: [],
              links: [], broken: [], orphans: [], missing: REFS.slice(),
              fm: '', fmName: '', fmDesc: '', tplFields: [], tplCellFields: [], recConsts: {} };
  if (!d.skillExists) return d;
  d.skill = fs.readFileSync(skillMd, 'utf8');
  const refDir = path.join(env.skill, 'references');
  d.refFiles = fs.existsSync(refDir) ? fs.readdirSync(refDir).filter(n => /\.md$/.test(n)).sort() : [];
  for (const n of d.refFiles) d.refs[n] = fs.readFileSync(path.join(refDir, n), 'utf8');
  const seen = {};
  const re = /references\/([A-Za-z0-9_.-]+\.md)/g;
  let mm;
  while ((mm = re.exec(d.skill)) !== null) seen[mm[1]] = (seen[mm[1]] || 0) + 1;
  d.links = Object.keys(seen).sort();
  d.broken = d.links.filter(n => d.refFiles.indexOf(n) < 0);
  d.orphans = d.refFiles.filter(n => d.links.indexOf(n) < 0);
  d.missing = REFS.filter(n => d.refFiles.indexOf(n) < 0);
  const fm = d.skill.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  d.fm = fm ? fm[1] : '';
  d.fmName = (d.fm.match(/^name:\s*(\S+)\s*$/m) || [])[1] || '';
  d.fmDesc = (d.fm.match(/^description:\s*(.+)$/m) || [])[1] || '';
  /* 雛形の「埋める欄」= チェックボックス行。⭐ (2b) はこの母集団の中に
     マス数の欄が無いことを見る (⛔ 「マス数」という語の有無で見ると、
     罠を説明している注意書きに当たって永久に赤くなる)。 */
  const tpl = d.refs['map-brief-template.md'] || '';
  d.tplFields = tpl.split(/\r?\n/).filter(l => l.indexOf('- [ ] ') === 0);
  d.tplCellFields = d.tplFields.filter(l => /マス数|セル数|何マス|グリッド数|cells/i.test(l));
  /* recipe に書かれた 4 定数 (⭐ 本番コードとの 2 経路突き合わせ) */
  const rec = d.refs['grid-fit-recipe.md'] || '';
  const cre = /(DEFAULT_TILE|TOL_DRIFT_WORLD|TOL_PHASE_WORLD|TOL_SCORE_RATIO)\s*=\s*([0-9.]+)/g;
  while ((mm = cre.exec(rec)) !== null) d.recConsts[mm[1]] = parseFloat(mm[2]);
  return d;
}

function measure(env, need) {
  const want = (k) => !need || need.indexOf(k) >= 0;
  const m = { env: env, need: need };
  m.mod = jsonFrom(runPy([READ_PY, env.mgm]), 'GRIDS 読み出し');
  m.docs = readDocs(env);
  const srcOf = (k) => (m.mod.grids[k] || {}).src_abs;
  if (want('fitPhlan')) {
    m.assetsBefore = snapshotAssets();
    m.fitPhlan = runFit(env, srcOf(KEY_PHLAN), ['--tile', '64']);
    m.assetsAfter = snapshotAssets();
  }
  if (want('fitMine')) {
    m.fitMine = runFit(env, srcOf(KEY_MINE), ['--fit-around', String(FIT_CENTER_MINE), '--tile', '64']);
  }
  if (want('bake')) {
    const outDir = path.join(TMP, 'bake_' + (env.tag || 'pure'));
    fs.mkdirSync(outDir, { recursive: true });
    m.bake = jsonFrom(runPy([BAKE_PY, env.mgm, outDir]), '焼き直し');
    m.list = runPy([env.mgm, '--list']);
  }
  return m;
}

// ══════════════════════════════════════════════════════════════════════════════
// assert (⭐ 期待値は GRIDS / 実ファイルから毎回導く。ドライバに直書きしない)
// ══════════════════════════════════════════════════════════════════════════════
function cmpFit(fit, spec, tol) {
  if (!fit || fit.code !== 0) {
    return [false, '⛔ --fit が exit ' + (fit ? fit.code : '?') + ': '
      + ((fit && (fit.err || fit.out)) || '').trim().split(/\r?\n/).slice(0, 3).join(' / ')];
  }
  const p = fit.parsed;
  if (!p.period || !p.phase || !p.cells) return [false, '⛔ 「GRIDS へ貼る形」の 3 行が読めない'];
  const bad = [];
  for (let i = 0; i < 2; i++) {
    if (Math.abs(p.period[i] - spec.period[i]) > tol.period) bad.push('period[' + i + '] ' + p.period[i] + ' vs ' + spec.period[i]);
    if (Math.abs(p.phase[i] - spec.phase[i]) > tol.phase) bad.push('phase[' + i + '] ' + p.phase[i] + ' vs ' + spec.phase[i]);
    if (p.cells[i] !== spec.cells[i]) bad.push('cells[' + i + '] ' + p.cells[i] + ' vs ' + spec.cells[i]);
  }
  const shown = '測定 phase(' + p.phase + ') period(' + p.period + ') cells(' + p.cells + ')'
    + ' / 台帳 phase(' + spec.phase + ') period(' + spec.period + ') cells(' + spec.cells + ')'
    + ' [許容 period±' + tol.period + ' phase±' + tol.phase + ']';
  return [bad.length === 0, (bad.length ? '⛔ ' + bad.join(' , ') + '  ' : '') + shown];
}

const ASSERT_OF = {
  '0a': ['(0a) [装置] 台帳 GRIDS のキーが 4 件以上ある (母集団が空でない)', (m) => {
    const n = Object.keys(m.mod.grids).length;
    return [n >= 4, n + ' 件: ' + Object.keys(m.mod.grids).join(' / ')];
  }],
  '0b': ['(0b) [装置] GRIDS の素材が SRC_DIR に全件実在する', (m) => {
    const miss = Object.keys(m.mod.grids).filter(k => !m.mod.grids[k].src_exists);
    return [miss.length === 0, (miss.length ? '⛔ 欠品: ' + miss.join(',') + '  ' : '') + 'SRC_DIR=' + m.mod.src_dir];
  }],
  '1a': ['(1a) --fit が台帳 phlan-harbor の 6 数値を素材から復元する', (m) =>
    cmpFit(m.fitPhlan, m.mod.grids[KEY_PHLAN], TOL_1A)],
  '1b': ['(1b) --fit が台帳 mine-entrance (周期 45.70) も復元する = 探索が --tile に張り付いていない', (m) =>
    cmpFit(m.fitMine, m.mod.grids[KEY_MINE], TOL_1B)],
  '1c': ['(1c) --fit は assets/ に 1 バイトも書かない (名前+サイズ+mtime が完全一致)', (m) => {
    const a = m.assetsBefore.join('|@|'), b = m.assetsAfter.join('|@|');
    if (a === b) return [true, m.assetsBefore.length + ' ファイルが不変'];
    const before = {};
    m.assetsBefore.forEach(r => { before[r.split('|')[0]] = r; });
    const diff = m.assetsAfter.filter(r => before[r.split('|')[0]] !== r).map(r => r.split('|')[0]);
    return [false, '⛔ 変化: ' + diff.slice(0, 5).join(',') + ' (計 ' + diff.length + ')'];
  }],
  '2a': ['(2a) マス数は「素朴な割り算」ではなく測って出てくる値 (1536/64=24 ではなく 23)', (m) => {
    const f = m.fitPhlan, spec = m.mod.grids[KEY_PHLAN];
    if (!f || f.code !== 0 || !f.parsed.cells || !f.parsed.wh) return [false, '⛔ --fit の出力が読めない (exit=' + (f && f.code) + ')'];
    const naive = [Math.round(f.parsed.wh[0] / 64), Math.round(f.parsed.wh[1] / 64)];
    const got = f.parsed.cells;
    const differs = (got[0] !== naive[0]) || (got[1] !== naive[1]);
    const matchesLedger = got[0] === spec.cells[0] && got[1] === spec.cells[1];
    return [differs && matchesLedger,
      '素材 ' + f.parsed.wh.join('x') + ' / 素朴な割り算 ' + naive.join('x')
      + ' / 測定 ' + got.join('x') + ' / 台帳 ' + spec.cells.join('x')
      + (differs ? '' : '  ⛔ 素朴な割り算と一致してしまっている')
      + (matchesLedger ? '' : '  ⛔ 台帳と食い違う')];
  }],
  '2b': ['(2b) SKILL.md が「マス数は測って出てくる値」と書き、雛形にマス数を書かせる欄が無い', (m) => {
    const d = m.docs;
    const said = /マス数はここで決めない/.test(d.skill) && /マス数は発注する値ではなく、測って出てくる値/.test(d.skill);
    const enough = d.tplFields.length >= 5;
    const clean = d.tplCellFields.length === 0;
    return [said && enough && clean,
      'SKILL.md の記述=' + said + ' / 雛形の埋める欄=' + d.tplFields.length + ' 件'
      + (clean ? ' (マス数の欄なし)' : ' ⛔ マス数の欄: ' + d.tplCellFields.join(' | '))
      + (enough ? '' : ' ⛔ 欄が少なすぎ = 母集団未到達')];
  }],
  '3a': ['(3a) 既存 4 件を焼き直すと assets/ の現物と SHA-256 が完全一致する (--fit は焼きを 1 バイトも変えていない)', (m) => {
    const ks = Object.keys(m.bake);
    const bad = ks.filter(k => !m.bake[k].asset_exists || m.bake[k].sha_fresh !== m.bake[k].sha_asset);
    const ng = ks.filter(k => !m.bake[k].verify_ok);
    return [bad.length === 0 && ng.length === 0 && ks.length >= 4,
      ks.length + ' 件'
      + (bad.length ? '  ⛔ SHA 不一致: ' + bad.join(',') : '  SHA 全件一致')
      + (ng.length ? '  ⛔ 検算 NG: ' + ng.join(',') : '  検算 OK')
      + '  [' + ks.map(k => k + '=' + m.bake[k].sha_fresh.slice(0, 8)).join(' ') + ']'];
  }],
  '3b': ['(3b) --list が全件を出し、各件の cells x tile が assets/ の実寸と一致する', (m) => {
    const ks = Object.keys(m.mod.grids);
    const lines = (m.list.out || '').split(/\r?\n/).filter(l => l.trim().length);
    const bad = [];
    for (const k of ks) {
      const g = m.mod.grids[k], b = m.bake[k];
      if (!b || !b.asset_wh) { bad.push(k + ' 現物なし'); continue; }
      const want = [g.cells[0] * g.tile, g.cells[1] * g.tile];
      if (want[0] !== b.asset_wh[0] || want[1] !== b.asset_wh[1]) {
        bad.push(k + ' ' + g.cells.join('x') + ' x ' + g.tile + ' = ' + want.join('x') + ' vs 現物 ' + b.asset_wh.join('x'));
      }
    }
    return [bad.length === 0 && lines.length === ks.length && m.list.code === 0,
      '--list ' + lines.length + ' 行 / 台帳 ' + ks.length + ' 件'
      + (bad.length ? '  ⛔ ' + bad.join(' , ') : '  寸法 全件一致')];
  }],
  '3c': ['(3c) 閾値 4 定数が references/grid-fit-recipe.md の記載と一致する (作法と実装のドリフト検出)', (m) => {
    const code = m.mod.consts, doc = m.docs.recConsts;
    const names = ['DEFAULT_TILE', 'TOL_DRIFT_WORLD', 'TOL_PHASE_WORLD', 'TOL_SCORE_RATIO'];
    const missing = names.filter(n => !(n in doc));
    const bad = names.filter(n => (n in doc) && Math.abs(doc[n] - code[n]) > 1e-9);
    return [missing.length === 0 && bad.length === 0,
      (missing.length ? '⛔ recipe に無い: ' + missing.join(',') + '  ' : '')
      + (bad.length ? '⛔ 食い違い: ' + bad.map(n => n + ' code=' + code[n] + ' doc=' + doc[n]).join(' , ') + '  ' : '')
      + names.map(n => n + '=' + code[n]).join(' ')];
  }],
  '4a': ['(4a) SKILL.md の frontmatter に name: codex-map-request と description が在る', (m) => {
    const d = m.docs;
    return [d.skillExists && d.fmName === 'codex-map-request' && (d.fmDesc || '').length >= 80,
      'name=' + JSON.stringify(d.fmName) + ' / description ' + (d.fmDesc || '').length + ' 文字'];
  }],
  '4b': ['(4b) references 3 枚が実在し、SKILL.md から全部リンクされている (リンク切れ 0 / 孤児 0)', (m) => {
    const d = m.docs;
    return [d.missing.length === 0 && d.broken.length === 0 && d.orphans.length === 0,
      '実在=' + d.refFiles.join(',') + ' / リンク=' + d.links.join(',')
      + (d.missing.length ? '  ⛔ 欠品: ' + d.missing.join(',') : '')
      + (d.broken.length ? '  ⛔ リンク切れ: ' + d.broken.join(',') : '')
      + (d.orphans.length ? '  ⛔ 孤児: ' + d.orphans.join(',') : '')];
  }],
};

const SECTIONS = [
  ['§0 装置 (先に母集団を確かめる)', ['0a', '0b']],
  ['§1 --fit が既存台帳を復元する (本体)', ['1a', '1b', '1c']],
  ['§2 マス数が「出力」であることの明示', ['2a', '2b']],
  ['§3 恒等 (非退行)', ['3a', '3b', '3c']],
  ['§4 スキルが読み込める形をしている', ['4a', '4b']],
];

function emit(key, m) {
  const a = ASSERT_OF[key];
  let r;
  try { r = a[1](m); } catch (e) { r = [false, '⛔ 述語が例外: ' + (e && e.message)]; }
  check(a[0], r[0] === true, r[1]);
}

// ══════════════════════════════════════════════════════════════════════════════
// 変異の適用 (ファイルのコピーへ)
// ══════════════════════════════════════════════════════════════════════════════
const ROOT_LINE = 'ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))';
function copyDirSync(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const n of fs.readdirSync(src)) {
    const s = path.join(src, n), d = path.join(dst, n);
    if (fs.statSync(s).isDirectory()) copyDirSync(s, d);
    else fs.copyFileSync(s, d);
  }
}
/* ⚠ ROOT を絶対パスへ固定してからコピーする。これが無いと OUT_DIR が <tmp>/assets を
 *   指し、変異 fitwrite の「本番の assets/ を書き換える」欠陥が再現できない。 */
function pureMgm() {
  const src = fs.readFileSync(path.join(ROOT, MGM_REL), 'utf8');
  if (src.split(ROOT_LINE).length - 1 !== 1) throw new Error('ROOT 行のアンカーが 1 箇所でない');
  return src.replace(ROOT_LINE, 'ROOT = r"' + ROOT + '"');
}
function buildEnv(key) {
  const dir = path.join(TMP, 'mut_' + key);
  fs.mkdirSync(dir, { recursive: true });
  let mgm = pureMgm();
  const skillDst = path.join(dir, 'skill');
  copyDirSync(path.join(ROOT, SKILL_REL), skillDst);
  const mt = MUTATIONS[key];
  if (mt.file === MGM_REL) {
    if (mgm.split(mt.from).length - 1 !== 1) throw new Error('変異 ' + key + ' のアンカーが 1 箇所でない');
    mgm = mgm.replace(mt.from, mt.to);
  } else {
    const p = path.join(skillDst, path.basename(mt.file));
    const s = fs.readFileSync(p, 'utf8');
    if (s.split(mt.from).length - 1 !== 1) throw new Error('変異 ' + key + ' のアンカーが 1 箇所でない');
    fs.writeFileSync(p, s.replace(mt.from, mt.to), 'utf8');
  }
  const mgmPath = path.join(dir, 'make_grid_map.py');
  fs.writeFileSync(mgmPath, mgm, 'utf8');
  return { mgm: mgmPath, skill: skillDst, tag: key, dir: dir };
}

// ══════════════════════════════════════════════════════════════════════════════
(function main() {
  const PURE = { mgm: path.join(ROOT, MGM_REL), skill: path.join(ROOT, SKILL_REL), tag: 'pure' };
  try {
    if (!NEGATIVE) {
      const env = MUTATE ? buildEnv(MUTATE) : PURE;
      if (MUTATE) console.log('[drv] ⚠ 変異 ' + MUTATE + ' を載せて素の節を出しています');
      console.log('[drv] 測定中 … (--fit x2 / 台帳の全件を焼き直し)');
      const m = measure(env, null);

      console.log('\n[記録] --fit の実測 (⭐ 期待値は GRIDS から毎回導いている):');
      for (const pair of [[KEY_PHLAN, m.fitPhlan], [KEY_MINE, m.fitMine]]) {
        const g = m.mod.grids[pair[0]], f = pair[1];
        console.log('   ' + pair[0] + '  素材 ' + (f.parsed.wh || []).join('x')
          + '   測定 phase(' + f.parsed.phase + ') period(' + f.parsed.period + ') cells(' + f.parsed.cells + ')'
          + '   台帳 phase(' + g.phase + ') period(' + g.period + ') cells(' + g.cells + ')');
      }

      for (const sec of SECTIONS) {
        mark(sec[0]);
        for (const k of sec[1]) emit(k, m);
      }

      mark('変異アンカーが本番ファイルに実在する (⭐ ここが赤いと --negative が空振りする)');
      for (const k of MUT_ORDER) {
        const mt = MUTATIONS[k];
        const body = fs.readFileSync(path.join(ROOT, mt.file), 'utf8');
        const nFrom = body.split(mt.from).length - 1;
        const nTo = body.split(mt.to).length - 1;
        check('(0c-' + k + ') 変異 ' + k + ' のアンカーが ' + mt.file + ' にちょうど 1 つ在り、注入後の文字列は無い',
          nFrom === 1 && nTo === 0, 'from=' + nFrom + ' 箇所 / to=' + nTo + ' 箇所');
      }
    } else {
      // ══ 負のコントロール ═══════════════════════════════════════════════════
      mark('変異が素のファイルに無く、コピーにだけ載っていること');
      for (const k of MUT_ORDER) {
        const mt = MUTATIONS[k];
        const env = buildEnv(k);
        const target = mt.file === MGM_REL ? env.mgm : path.join(env.skill, path.basename(mt.file));
        const pure = mt.file === MGM_REL ? pureMgm() : fs.readFileSync(path.join(ROOT, mt.file), 'utf8');
        const mut = fs.readFileSync(target, 'utf8');
        check('(n0a-' + k + ') 素には注入文字列が無く、変異側にちょうど 1 つある',
          pure.split(mt.to).length - 1 === 0 && mut.split(mt.to).length - 1 === 1, mt.file);
        check('(n0b-' + k + ') 素と変異でバイト長が違う (同じ物を 2 回測っていない)',
          pure.length !== mut.length, '素=' + pure.length + ' / 変異=' + mut.length);
        mt.env = env;
      }

      mark('欠陥を注入すると担当の節が赤くなること (⭐ 素と同じ装置・同じ述語をコピーへ)');
      for (const k of MUT_ORDER) {
        const mt = MUTATIONS[k];
        const m = measure(mt.env, mt.need);
        const res = {};
        for (const key of mt.evaluable) {
          try { res[key] = ASSERT_OF[key][1](m); }
          catch (e) { res[key] = [false, '⛔ 述語が例外: ' + (e && e.message)]; }
        }
        for (const key of mt.targets) {
          const r = res[key] || [true, '⛔ evaluable に載っていない = この変異では測っていない'];
          check('(neg-' + k + '-' + key + ') 変異 ' + k + ' で (' + key + ') が赤くなる — ' + ASSERT_OF[key][0].slice(0, 46),
            r[0] === false, (r[0] ? '⛔ 緑のまま (空振り) ' : '') + r[1]);
        }
        const red = mt.evaluable.filter(key => res[key][0] === false);
        const extra = red.filter(key => mt.targets.indexOf(key) < 0);
        const unexpected = extra.filter(key => (mt.allowRed || []).indexOf(key) < 0);
        check('(neg-' + k + '-範囲) 変異 ' + k + ' は担当外の節を巻き込まない (見た節=' + mt.evaluable.join('/') + ')',
          unexpected.length === 0,
          '赤=' + (red.length ? red.join(',') : '(無し)')
          + '  担当=' + mt.targets.join(',')
          + '  想定内の巻き添え=' + ((mt.allowRed || []).length ? mt.allowRed.join(',') : '(無し)')
          + '  緑のまま=' + (mt.evaluable.filter(x => red.indexOf(x) < 0).join(',') || '(無し)')
          + (unexpected.length ? '  ⛔ 想定外の巻き込み=' + unexpected.join(',') : ''));
      }

      mark('変異の実装漏れ');
      check('(n9a) [装置] PENDING の変異が 0 件 (' + MUT_ORDER.length + ' 本すべて実装済)', true, MUT_ORDER.join(' / '));
    }
  } catch (e) {
    check('(fatal) ドライバが例外なく完走する', false, e.message + '\n' + (e.stack || ''));
  } finally {
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* 掃除の失敗は無視 */ }
  }

  const passed = results.filter(r => r.state === 'PASSED');
  const failed = results.filter(r => r.state === 'FAILED');
  const pend = results.filter(r => r.state === 'PENDING');
  console.log('\n──────────────────────────────────────────────');
  console.log('  ' + passed.length + '/' + (passed.length + failed.length) + ' PASSED'
    + '   FAILED ' + failed.length + '   **PENDING** ' + pend.length);
  if (failed.length) {
    console.log('  FAILED:');
    for (const b of failed) console.log('    - ' + b.name + (b.detail ? '  — ' + b.detail : ''));
  }
  if (pend.length) {
    console.log('  **PENDING** (完了条件 = ここが 0 件):');
    for (const b of pend) console.log('    - ' + b.name + (b.detail ? '  — ' + b.detail : ''));
  }
  process.exit(failed.length ? 1 : 0);
})();
