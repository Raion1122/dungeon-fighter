/*
 * _pptr_profile.js — ヘッドレス検証ドライバ用「使い捨て Chrome プロファイル」の生成 + 自動後始末
 * ═══════════════════════════════════════════════════════════════════════════════
 * ■ 直した欠陥 (2026-07-31)
 *   全ドライバが `--user-data-dir=<TEMP>/df_*_<timestamp>` を起動のたびに新規作成し、
 *   **終了時に一切消していなかった**。1回あたり 0〜100MB。実測で **1710 個・約 8.0GB** 滞留していた。
 *
 * ■ 使い方
 *     const profile = require('./_pptr_profile')('df_myDriver_');
 *     puppeteer.launch({ args: ['--user-data-dir=' + profile, ...] })
 *   → プロセス終了時 (正常終了 / 例外 / Ctrl+C) に自動で消える。呼び出し側の後始末は不要。
 *
 * ■ 滞留分の掃除も兼ねる
 *   `%TEMP%/df_pptr/` に置いた**使い捨てドライバ 315 本**は repo 外なので直しようがない
 *   (今回いちばん溜めていた df_pptr_bs_* = driver_room_beltscroll.js もそこにいる)。
 *   そこで **本モジュールを使った時に、古い滞留プロファイルを掃く**。
 *   tools/ のドライバを1本走らせるだけで legacy 分まで回収される。
 *   手動で全部掃きたい時:  node tools/_pptr_profile.js --sweep --hours 0
 *   何が消えるか見るだけ:  node tools/_pptr_profile.js --sweep --hours 0 --dry-run
 *   掃除を止めたい時    :  環境変数 DF_NO_SWEEP=1
 *
 * ■ ⚠️⚠️ 消してはいけないものが同じ `df_` 接頭辞に同居している (実地調査済み)
 *   - `df_pptr`            … puppeteer-core の node_modules とドライバ本体 = **検証環境そのもの**
 *   - `df_*_baseline`      … 負のコントロール用の**リポジトリのコピー** (index.html を含む)
 *   - `df_wt_*`/`df_head_*`… git worktree / ベースライン
 *   名前だけで判定すると必ず事故る。よって削除は次の**三重条件をすべて**満たす時のみ:
 *     (1) Chrome の user-data-dir の目印を持つ (Default / Local State / Crashpad …) か、空
 *     (2) `.git` / `index.html` / `CLAUDE.md` の**どれも持たない**
 *     (3) mtime が閾値 (既定 6 時間) より古い  ← 並走中の別ドライバを巻き込まないため
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = os.tmpdir();
const PREFIX = 'df_';
const KEEP_ALWAYS = new Set(['df_pptr']);
// Chrome が user-data-dir に必ず作る物のどれか (バージョン差があるので複数見る)
const CHROME_MARKERS = ['Default', 'Local State', 'Crashpad', 'First Run', 'Last Version',
  'component_crx_cache', 'SingletonLock', 'lockfile', 'Variations'];
// これらを持つディレクトリは「リポジトリのコピー / ワークツリー」なので絶対に消さない
const REPO_MARKERS = ['.git', 'index.html', 'CLAUDE.md'];
const DEFAULT_STALE_HOURS = 6;

// ── 自分が作ったプロファイルの後始末 ────────────────────────────────────────
const owned = [];
let hooked = false;

function rmrf(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); return true; }
  catch (e) { return false; }
}

function cleanupOwned() {
  // splice で取り出す = exit と signal の両方が発火しても二重削除しない
  for (const d of owned.splice(0)) rmrf(d);
}

function installHooks() {
  if (hooked) return;
  hooked = true;
  // 正常終了・未捕捉例外 (Node は stack を出した後 'exit' を発火する) の両方をこれで拾う。
  process.on('exit', cleanupOwned);
  // ⚠️ シグナルはハンドラが無いと 'exit' を発火せずに即死するので個別に要る。
  //    SIGTERM/SIGHUP は Windows では発火しないが、登録しても害はない。
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
    try {
      process.on(sig, () => { cleanupOwned(); process.exit(sig === 'SIGINT' ? 130 : 143); });
    } catch (e) { /* 未対応シグナルは無視 */ }
  }
}

// ── 滞留分の掃除 ────────────────────────────────────────────────────────────
function looksLikeChromeProfile(dir) {
  let entries;
  try { entries = fs.readdirSync(dir); } catch (e) { return false; }
  if (entries.length === 0) return true;                          // 空 = 起動に失敗した残骸
  if (REPO_MARKERS.some(m => entries.includes(m))) return false;  // ⚠️ repo のコピー → 触らない
  return CHROME_MARKERS.some(m => entries.includes(m));
}

function sweep(opts) {
  const o = opts || {};
  const hours = (o.hours === undefined) ? DEFAULT_STALE_HOURS : o.hours;
  const cutoff = Date.now() - hours * 3600 * 1000;
  const res = { scanned: 0, removed: 0, skipped: 0, failed: 0, names: [] };
  let names;
  try { names = fs.readdirSync(TMP); } catch (e) { return res; }
  for (const name of names) {
    if (!name.startsWith(PREFIX) || KEEP_ALWAYS.has(name)) continue;
    const full = path.join(TMP, name);
    let st;
    try { st = fs.statSync(full); } catch (e) { continue; }
    if (!st.isDirectory()) continue;
    if (owned.indexOf(full) >= 0) continue;                       // 今このプロセスが使っている物
    res.scanned++;
    if (st.mtimeMs > cutoff) { res.skipped++; continue; }         // 新しすぎる = 並走中かもしれない
    if (!looksLikeChromeProfile(full)) { res.skipped++; continue; }
    if (o.dryRun) { res.removed++; res.names.push(name); continue; }
    if (rmrf(full)) { res.removed++; res.names.push(name); } else { res.failed++; }
  }
  return res;
}

let sweptThisProcess = false;
function sweepOnce() {
  if (sweptThisProcess || process.env.DF_NO_SWEEP === '1') return;
  sweptThisProcess = true;
  try {
    const r = sweep({});
    if (r.removed > 0) console.log(`[profile] 滞留プロファイルを ${r.removed} 個掃除しました`);
  } catch (e) { /* 掃除の失敗でドライバを止めない */ }
}

// ── 本体 ────────────────────────────────────────────────────────────────────
function makeProfile(prefix) {
  const p = (prefix && String(prefix)) || 'df_pptr_profile_';
  const dir = fs.mkdtempSync(path.join(TMP, p));
  owned.push(dir);
  installHooks();
  sweepOnce();
  return dir;
}

module.exports = makeProfile;
module.exports.makeProfile = makeProfile;
module.exports.sweep = sweep;
module.exports.cleanupOwned = cleanupOwned;

// ── CLI: node tools/_pptr_profile.js --sweep [--hours N] [--dry-run] ────────
if (require.main === module) {
  const argv = process.argv.slice(2);
  const has = (n) => argv.indexOf('--' + n) >= 0;
  const val = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
  if (!has('sweep')) {
    console.log('使い方: node tools/_pptr_profile.js --sweep [--hours N] [--dry-run]');
    console.log('  --hours N   N 時間より古い物だけ消す (既定 ' + DEFAULT_STALE_HOURS + '、0 で全部)');
    console.log('  --dry-run   消さずに対象だけ表示する');
    process.exit(0);
  }
  const hours = parseFloat(val('hours', String(DEFAULT_STALE_HOURS)));
  const dryRun = has('dry-run');
  const r = sweep({ hours, dryRun });
  console.log(`[sweep] ${TMP}`);
  console.log(`  df_* の走査数 : ${r.scanned}`);
  console.log(`  ${dryRun ? '削除対象' : '削除した'} : ${r.removed}`);
  console.log(`  保護/対象外  : ${r.skipped}   削除失敗: ${r.failed}`);
  if (r.names.length) console.log('  例: ' + r.names.slice(0, 5).join(', ') + (r.names.length > 5 ? ' …' : ''));
}
