/*
 * _golden.js — 非退行 assert の基準値 (golden) の記録 / 照合
 * ═══════════════════════════════════════════════════════════════════════════════
 * ■ 直した欠陥 (2026-08-03)
 *   `driver_field_*` 5 本が「既存6シナリオの描画が **固定コミット** と SHA-256 一致」で
 *   非退行を測っていた。2 部屋化 / ベルトスクロール化 / 屋外景観リデザインで既存 6 シナリオの
 *   絵を**意図的に**変えた結果、この比較は原理的に成立しなくなり、5 本とも**赤いまま安定**した。
 *   赤が常態化した検出器は**何も検出していないのと同じ**(新しい回帰が来ても FAIL が 1 本
 *   増えるだけで区別がつかない)。しかも「固定コミットへのピン留め」は、幾何を動かした瞬間に
 *   自己失効するのに**誰にも通知されない**。
 *
 * ■ なぜ golden なのか (単に新しいコミットへ張り替えるのでは駄目な理由)
 *   張り替えは時計を巻き戻すだけで、次に幾何や絵を動かした瞬間に**同じ壊れ方を再発**し、
 *   やはり気づかれない。golden は陳腐化が
 *       「FAIL が出る → --update-golden で更新 → git diff に載る → commit でレビューされる」
 *   という**明示的な操作**として可視化される。放置すると赤いままなのは同じだが、
 *   直し方が 1 コマンドで、しかも**何がどう変わったかが git 履歴に残る**。
 *
 * ■ 使い方 (ドライバ側)
 *     const UPDATE_GOLDEN = flag('update-golden');
 *     const G = require('./_golden')('field_step3', { update: UPDATE_GOLDEN });
 *     ...
 *     G.check(check, '(D2-' + scen + ') mapCanvas SHA-256 が golden と一致', 'D2-' + scen, sha);
 *     ...
 *     G.distinct(check, '(G1) 6 シナリオの描画が相互に異なる', 'D2-');
 *     G.finish(check);
 *
 *   golden 記録:  node tools/driver_field_step3.js --update-golden
 *   → tools/goldens/field_step3.json を書き出す。**必ず git add して commit すること**。
 *
 * ■ golden 方式そのものが持つ危険と、その封じ方
 *   最大の危険は「**壊れた状態を golden として焼き付ける**」こと。真っ白な canvas を記録すると
 *   以後永久に真っ白で PASS する = 新種の「何も検出しない検出器」になる。よって:
 *     (1) `distinct()` … 同じ母集団 (6 シナリオ等) の値が**相互に異なる**ことを要求する。
 *         描画が死んで一様になったら即座に落ちる。⚠ 件数や合計ではなく **identity** で測る。
 *     (2) `finish()`   … golden のキー集合と今回の実行のキー集合が**完全一致**することを要求する。
 *         assert をこっそり消した / 増やしたのに golden が古いままなら落ちる。
 *     (3) 記録した rev と working tree の汚れを golden 内に残す。汚れたツリーからの記録は警告。
 *     (4) golden が無い時は **exit 2 で異常終了**する (silent に PASS させない)。
 *
 * ■ ⚠️ 負のコントロール用の baseline worktree は **これとは別物**。触らないこと。
 *   「この assert が空振りでない証明として、機能が入る直前のコミットでは必ず FAIL する」は
 *   歴史的事実へのピン留めなので**永久に陳腐化しない**。陳腐化したのは非退行側だけ。
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const DIR = path.join(__dirname, 'goldens');

function headInfo() {
  const o = { rev: '<unknown>', subject: '', dirty: null };
  const git = (args) => execFileSync('git', ['-C', REPO].concat(args), { encoding: 'utf8' }).trim();
  try { o.rev = git(['rev-parse', '--short', 'HEAD']); } catch (e) {}
  try { o.subject = git(['log', '-1', '--format=%s']); } catch (e) {}
  // 描画に効くものだけを見る。tools/ や dev-meetings/ の変更で「汚れ」判定にはしない。
  try { o.dirty = git(['status', '--porcelain', '--', 'index.html', 'js', 'assets']).length > 0; } catch (e) {}
  return o;
}

const norm = (v) => JSON.stringify(v);

module.exports = function openGolden(name, opts) {
  opts = opts || {};
  const update = !!opts.update;
  const driver = opts.driver || ('driver_' + name);
  const file = path.join(DIR, name + '.json');
  const rel = path.relative(REPO, file).replace(/\\/g, '/');

  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {}
  if (prev && (!prev.values || typeof prev.values !== 'object')) prev = null;

  if (!update && !prev) {
    console.error('[golden] 基準値ファイルが無い/壊れている: ' + rel);
    console.error('[golden] 現行の挙動を基準として記録するには --update-golden を付けて走らせ、');
    console.error('[golden] 書き出された JSON を **git add して commit** してください。');
    console.error('[golden] (基準が無いまま緑にすると「何も検出しない検出器」になるので exit 2 で止めます)');
    process.exit(2);
  }
  if (update) {
    const h = headInfo();
    console.log('[golden] 記録モード: ' + rel + '  ← ' + h.rev + ' ' + h.subject);
    if (h.dirty) {
      console.log('[golden] ⚠️ index.html / js / assets に未コミットの変更があります。');
      console.log('[golden] ⚠️ 「まだ commit していない挙動」を基準として焼き付けようとしています。');
    }
  }

  const captured = Object.create(null);
  const order = [];

  return {
    update, file, rel,
    capturedFrom: prev ? prev.capturedFrom : null,

    /**
     * 1 件の非退行値を golden と照合する (記録モードなら記録する)。
     * checkFn は各ドライバの check(name, cond, detail)。
     */
    check(checkFn, assertName, key, value) {
      if (key in captured) throw new Error('[golden] キーが重複している: ' + key);
      captured[key] = value; order.push(key);
      const cur = norm(value);
      if (update) {
        checkFn(assertName + ' [記録]', true, 'golden へ記録: ' + cur.slice(0, 64));
        return true;
      }
      const has = Object.prototype.hasOwnProperty.call(prev.values, key);
      const exp = has ? norm(prev.values[key]) : '<golden に無い>';
      const ok = has && exp === cur;
      checkFn(assertName, ok,
        'cur=' + cur.slice(0, 72) + ' golden=' + exp.slice(0, 72) +
        (ok ? '' : '  ← 意図した変更なら --update-golden で更新して commit'));
      return ok;
    },

    /**
     * 同じ母集団の値が**相互に異なる**ことを要求する。
     * 描画が死んで一様になった状態を golden に焼き付ける事故を防ぐ唯一のガード。
     * ⚠ 件数や合計ではなく identity で測る (グローバルな件数 assert は暗黙依存で壊れる)。
     */
    distinct(checkFn, assertName, keyPrefix) {
      const keys = order.filter((k) => k.indexOf(keyPrefix) === 0);
      const seen = new Map();
      const dup = [];
      for (const k of keys) {
        const v = norm(captured[k]);
        if (seen.has(v)) dup.push(seen.get(v) + ' == ' + k); else seen.set(v, k);
      }
      checkFn(assertName, keys.length > 0 && dup.length === 0,
        keys.length + ' 件 / 相異なる値 ' + seen.size + ' 件' + (dup.length ? ' / 重複: ' + dup.join(', ') : ''));
      return dup.length === 0;
    },

    /**
     * 全 check の後に必ず呼ぶ。キー集合の同一性を検査し、記録モードならファイルを書く。
     */
    finish(checkFn) {
      if (update) {
        const h = headInfo();
        const values = {};
        for (const k of order) values[k] = captured[k];
        const changed = prev
          ? order.filter((k) => norm(prev.values[k]) !== norm(captured[k]))
          : order.slice();
        const gone = prev ? Object.keys(prev.values).filter((k) => !(k in captured)) : [];
        const out = {
          _note: '非退行 assert の基準値。固定コミット比較の自己失効を避けるための golden。' +
                 '更新は `node tools/' + driver + '.js --update-golden` のみ。' +
                 '差分は必ず git diff でレビューしてから commit すること。',
          capturedFrom: h,
          values: values,
        };
        fs.mkdirSync(DIR, { recursive: true });
        fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n', 'utf8');
        console.log('[golden] 書き出し: ' + rel + '  (' + order.length + ' 件 / 変化 ' + changed.length +
                    ' 件 / 消滅 ' + gone.length + ' 件)');
        if (changed.length) console.log('[golden]   変化: ' + changed.join(', '));
        if (gone.length) console.log('[golden]   消滅: ' + gone.join(', '));
        console.log('[golden] ⚠️ 記録直後は必ず --update-golden **無し**で走らせ直し、全緑になることを');
        console.log('[golden] ⚠️ 確認してください (非決定な値を焼き付けていないことの証明になります)。');
        checkFn('(G0) golden を書き出した', true, rel + ' / ' + order.length + ' 件');
        return true;
      }
      const cur = new Set(order);
      const old = Object.keys(prev.values);
      const missing = old.filter((k) => !cur.has(k));   // golden にあるのに今回測らなかった
      const extra = order.filter((k) => !Object.prototype.hasOwnProperty.call(prev.values, k));
      const ok = missing.length === 0 && extra.length === 0;
      checkFn('(G0) golden のキー集合が今回の実行と完全一致 (assert の増減を検出)', ok,
        '今回 ' + order.length + ' 件 / golden ' + old.length + ' 件' +
        (missing.length ? ' / 測られなかった: ' + missing.join(', ') : '') +
        (extra.length ? ' / golden に無い: ' + extra.join(', ') : ''));
      return ok;
    },
  };
};
