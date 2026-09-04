#!/usr/bin/env node
/*
 * verify_roll_target.js — ロールの吹き出しに「必要な出目」と「成功/失敗 + 超過幅」(#49)
 * ════════════════════════════════════════════════════════════════════════════════
 * 実装依頼書 `実装依頼書/2026-09-04_roll-target-readout.md` の §8 受入条件を機械で測る。
 *
 * ■ ⭐⭐⭐ この 1 本は **§0〜§6 の枠を全部宣言する**。まだ実装されていない節は
 *   `pending()` で **PENDING** を明示的に出力し、`PASSED / FAILED / PENDING` の 3 値で
 *   締める。後続の項目が「どれを埋めるか」「黙って緑にしていないか」を一目で確認でき、
 *   **最終項目の完了条件が PENDING 0** になる
 *   (手本 = tools/verify_enemy_name_label.js / tools/verify_world_heromark.js)。
 *
 * ■ 項目 1 (このコミット) で足したもの — **§0 装置 (0a)〜(0d) だけ**
 *     (0a) 装置   … window.__rollTargetFmt が typeof === "function"
 *                   ⭐⭐⭐ これが無いと §1〜§4 の全 assert が例外か undefined で空振りする
 *     (0b) 2 経路 … 期待値を**依頼書から写経せず、配信中の index.html から導出する**
 *                   ⭐ 生成点の本数を "3" と書かない (§2-1 の実測値を写経しない)。
 *                     3 つの**独立した数え方**が一致することだけを縛る:
 *                       ① `function showRollAt` の定義の数
 *                       ② `pop.className = "rollPop " + type;` の数 (= type を受け取る生成点)
 *                       ③ `pop.innerHTML = html2;` の数 (= 注釈を通した生成点)
 *                     かつ **どの定義の本体にも素の `pop.innerHTML = html;` が残っていない**。
 *                   ⭐ 生成点が 4 本目に増えたとき「注釈が抜けている」なら ③ が足りず赤、
 *                     「4 本目もちゃんと注釈している」なら緑 — 在庫の総数を写経した装置が
 *                     在庫 +1 の日にまとめて嘘の赤を出す事故 (卓上グリッド P3 の教訓 ⑪) を避ける。
 *                   ⚠ 依頼書 §8 (0b) の字面「3 本ちょうど」より条件は **1 本増えている**
 *                     (素の代入が 1 つも残っていないこと)。受入条件は 1 つも弱めていない。
 *     (0c) 母集団 … 実プレイ (シナリオ1 廃坑を ?autoplay で回す) で `.rollPop` が 1 枚以上出ている
 *                   ⭐ 0 枚なら §5/§6 の実プレイ assert は全部空振り
 *     (0d) 母集団 … そのうち **`.verdictLine` を持つものが 1 枚以上**ある
 *                   ⚠ 「注釈対象になりうる吹き出し」(§4-5 の AND を満たすもの) が 0 枚のときは
 *                     popFail() を通して `population: none` を出す = 「測れないから赤」と
 *                     「値が悪いから赤」を記録の上で区別する
 *
 *   ⛔ §1〜§6 は**この項目では実装しない** (項目 2 の担当)。全部 PENDING で並べてある。
 *   ⭐⭐⭐ **項目 1 の時点では本番 (index.html) に計測シームも判定行も無いので、
 *     (0a)(0b)(0d) が赤いのが正しい。** 赤いこと自体は失敗ではない。
 *
 * ■ ⚠⚠⚠ §0 の全ガードに共通の規則 — **母集団が立たなかったら「スキップして緑」にしない**
 *   母集団が偽になったら、そのガード自身を FAIL にし、それを母集団とする本体の assert も
 *   FAIL にする。⭐ 「母集団が無いので測れなかった」を緑で記録すると、**assert が静かに
 *   消えるのに記録行は正常に見える**。本チケットでいちばん起こりやすい壊れ方
 *   (§2-8 の実測どおり `.rollPop` を見ている既存ドライバは 0 本 = このドライバが唯一の検査器)。
 *
 * ■ ⭐⭐⭐ 計測は実プレイに頼らない (依頼書 §6「計測機構」)
 *   検査対象の本体は**純関数** `rollTargetLine(html, type)` なので、§1〜§4 は
 *   **合成入力を `window.__rollTargetFmt` へ直接食わせる** (項目 2 が `evalFmt()` を使う)。
 *   実プレイが要るのは §0 の (0c)(0d) と (4c)(5a)(5b)(5c)(6a)(6b) だけ。
 *   ⚠ [[project-road-harvest-47]] の実測 = 実プレイ系ドライバを他の headless Chrome と
 *     並走させると偽の赤が出る (run_chronicle 73/73 が並走で 71/73)。
 *
 * ■ ⭐⭐⭐ 配信バイトは **起動時に 1 回だけ読んで凍結する** (下の SRC / MUT_SRC)。
 *   別窓が index.html を保存しても、走行中に混合ビルドにならない。
 *
 * ■ ⛔ 測らないこと (依頼書 §8「測らないこと」)
 *   色そのもの (#ffd980 / #9a9aa6) / フォントサイズの px 値 (11px / 13px) /
 *   margin-top の絶対値 (-16px。負であることだけ (5b) が縛る) /
 *   文言そのもの (出目 / 成功 / 失敗 / 会心のみ / 届かない)。
 *   ⭐ ただし **class 名** (verdictLine / need / win / lose / marg) は縛る。
 *     文言は日本語として推敲する余地を残し、構造だけ固定する。
 *   ⭐ (1a)〜(1h) の `出目 N+` は**数値部分の照合が目的**なので、ドライバ側は
 *     期待文字列を **写経ではなく計算** (raw = D - T + N) で組むこと (項目 2 への申し送り)。
 *
 * ■ ⚠ ポート **9880** (変異 9881〜9897 = 17 枠 / 撤退アームの基準ページ 9898)。
 *   依頼書 §2-10 の実測 = 既存ドライバの base は 8765 / 9600 / 9620 / 9760 / 9790 / 9850、
 *   9870 は #44 の撤退アーム。**9880〜9899 は衝突 0 本**。
 *   ⛔ 他のドライバのポートは 1 つも触らない。
 *   ⭐ 項目 1 が実際に listen するのは **9880 の 1 本だけ** (変異が 1 本も実装されておらず、
 *     撤退アームを見る (6a)(6b) もまだ PENDING のため)。番号だけ先に予約してある。
 *
 * ── 負のコントロール (--negative) ────────────────────────────────────────────
 *   ⭐ 項目 3 で **16 本すべて impl: true**。1 本ずつ別ポート (9881〜9896) から
 *     「欠陥入りの index.html」を配り、担当の assert が**実際に赤くなる**ことを機械証明する。
 *   ⚠⚠⚠ 依頼書 §8 の変異プランのうち **3 本はそのままでは空振りした**(項目 2/3 の実測):
 *     ① onlyplayer  … 差し替え 3 行は 3 箇所とも同一文字列 → from/to も edits[] も
 *                      一意にならず起動時検算で exit 3。⇒ transform で 2 本目以降だけ戻す。
 *     ② looseanchor … 「mTot を条件から外す」だけでは (3b)(3c) は緑のまま
 *                      (FUMBLE! は `=` も `vs` も無く、INITIATIVE は `vs` が無い)。
 *                      ⇒ AND を **2 本**外す (§8 の「条件が 1 本とは限らない」)。
 *     ③ skillmangle … 「SKILL 検出より前に注釈する」だけでは原理的に (4c) を赤にできない
 *                      (白名簿が "skill" を弾き html が同一のまま返るため)。
 *                      ⇒ 白名簿 + AND + append/prepend + 検出位置の **4 点同時**に壊し、
 *                        (4c) は 2 経路照合へ**強化**した (⛔ 期待値は緩めていない)。
 *   ⚠ from/to は **配信バイト中ちょうど 1 件**を実測してから書く (⛔ 当たることと
 *     赤くなることは別)。
 *   ⚠ 置換文字列は **1 行に閉じる** (index.html はディスク上 CRLF なので複数行アンカーは
 *     必ず空振りする。tools/*.js は LF)。
 *   ⚠ 置換前後で **長さを変える** (同じ長さだと「当たったのに何も変わらない」を検出できない)。
 *   ⚠ 注入文字列が**素に元から居ない**形にする (空白やコメントを足す = #44 で 2 回踏んだ)。
 *   ⭐ 変異が空振りしたら、**変異のほうを直す** (受入条件を弱めない = #38 の教訓)。
 *
 * 使い方:
 *   node tools/verify_roll_target.js              # 受入条件 (素の配信)
 *   node tools/verify_roll_target.js --negative   # 負のコントロール (項目 3 で実装)
 *   node tools/verify_roll_target.js --mutate noseam   # 変異を手回しで 1 つだけ載せる
 * exit 0=FAILED 0 / 1=FAILED あり / 2=環境不足 / 3=装置を作れなかった (測定不能)
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ⚠ path.resolve 必須。区切り文字のまま持つと fp.startsWith(ROOT) が常に false になり
//   全リクエストが 404 → 症状は「タイムアウト」だけで実装の欠陥に見える (2026-08-12 の実測)。
const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HEADFUL = flag('headful');
const NEGATIVE = flag('negative');
const MUTATE = arg('mutate', null);
const PORT = parseInt(arg('port', '9880'), 10);

// ══════════════════════════════════════════════════════════════════════════════
// 変異 (依頼書 §8 の変異表 16 行。⭐ 項目 1 では **全部 impl: false = PENDING**)
//   ⛔ MUT_ORDER には常に 16 本並べる = --negative が「実装を忘れた変異」を件数から隠さない。
//   ⭐ `plan` = 項目 3 への申し送り (どこへ何を当てる予定か)。⚠ **実測で数え直してから**
//     from/to へ昇格させること。plan のまま impl: true にしてはいけない。
//
//   ⭐⭐⭐ 依頼書 §2-2 / §2-3 / §2-4 / §2-5 / §2-11 の罠が、それぞれ
//     singlemod+nobr / verdictbymath / xformlift / skillmangle / samefloor1+samefloor2
//     として全部この表に内蔵されている。起草中にしか見えなかった知見が、実装後も
//     機械で守られる唯一の形。
// ══════════════════════════════════════════════════════════════════════════════
const MUTATIONS = {
  noseam: { impl: true, file: 'index.html', targets: ['0a'],
    from: 'window.__rollTargetFmt = rollTargetLine;',
    to: 'window.__rollTargetFmtREMOVED = rollTargetLine; /* neg:noseam */',
    why: '検証シーム window.__rollTargetFmt を消す (装置そのものが立たない)' },

  /* ⚠⚠⚠ 依頼書 §8 の「edits[] を使う」は**実物では成立しない**。
   *   `pop.innerHTML = html2;` の 3 行は **3 箇所とも完全に同一文字列**なので、
   *   from/to でも edits[] でも「置換対象がちょうど 1 件」の起動時検算に必ず引っかかり
   *   exit 3 で止まる (項目 2 の実測)。⇒ **transform で 2 本目以降だけ**を素へ戻す。 */
  onlyplayer: { impl: true, file: 'index.html', targets: ['0b'],
    transform: (body) => {
      const NEW = 'pop.innerHTML = html2;';
      const OLD = 'pop.innerHTML = html; /* neg:onlyplayer */';
      const at = [];
      for (let i = 0; ; ) {
        const p = body.indexOf(NEW, i); if (p < 0) break;
        at.push(p); i = p + NEW.length;
      }
      if (at.length < 2) return null;   // 2 本目が無ければ「元へ戻す」が成り立たない
      let out = '', prev = 0;
      for (let n = 1; n < at.length; n++) {          // ⭐ 1 本目 (showRollAtPlayer) は残す
        out += body.slice(prev, at[n]) + OLD;
        prev = at[n] + NEW.length;
      }
      out += body.slice(prev);
      return { body: out, note: '生成点 ' + at.length + ' 本のうち 2 本目以降 '
        + (at.length - 1) + ' 本を素の代入へ戻した' };
    },
    verifyServed: (pure, mut) => {
      const c = (h, n) => h.split(n).length - 1;
      const nPure = c(pure, 'pop.innerHTML = html2;');
      const nMut = c(mut, 'pop.innerHTML = html2;');
      const nOld = c(mut, 'pop.innerHTML = html; /* neg:onlyplayer */');
      /* ⛔ 「3 本」を写経しない。素の本数 N に対し 変異側は 1 本 + 素の代入 N-1 本。 */
      const ok = nPure >= 2 && nMut === 1 && nOld === nPure - 1
        && c(pure, 'pop.innerHTML = html; /* neg:onlyplayer */') === 0;
      return [ok, '素 html2×' + nPure + ' → 変異 html2×' + nMut + ' + 素の代入×' + nOld];
    },
    why: 'showRollAtEnemy / showRollAtAlly の差し替えを元へ戻す (敵と仲間の吹き出しだけ注釈が抜ける)' },

  verdictbymath: { impl: true, file: 'index.html', targets: ['2e', '2f'],
    from: 'const won    = (type === "hit" || type === "crit");',
    to: 'const won    = (total >= target); /* neg:verdictbymath */',
    why: '⭐ 罠 B の再現 — 勝敗を type でなく 合計 vs 目標 の算術から引く'
      + ' (CRIT! の吹き出しに「失敗 -3」と出る事故が現実に起きる)' },

  /* ⚠ 「\\+\\d+ = を前提にする」だけでは A-4 も通ってしまう ("+3装+2 = 19" の "+2 = " が当たる)。
   *   1 項限定を本当に再現するには **`)` の直後の 1 項**まで縛る必要がある。 */
  singlemod: { impl: true, file: 'index.html', targets: ['1d'],
    from: 'const mTot = html.match(/=\\s*(?:<span class="big">)?(-?\\d+)/);',
    to: 'const mTot = html.match(/\\)\\+\\d+ =\\s*(?:<span class="big">)?(-?\\d+)/); /* neg:singlemod */',
    why: '⭐ 罠 A の再現 — セーヴの saveModDD が返す "+3装+2" の 2 項を読めなくする' },

  nobr: { impl: true, file: 'index.html', targets: ['1c'],
    from: 'const mTgt = html.match(/vs\\s+(AC|DC)\\s+(\\d+)/);',
    to: 'const mTgt = html.match(/<br>vs\\s+(AC|DC)\\s+(\\d+)/); /* neg:nobr */',
    why: '⭐ 罠 A-3 の再現 — <br> の無い形 (混乱の暴走) が落ちる' },

  samefloor1: { impl: true, file: 'index.html', targets: ['1e'],
    from: 'const floorN = (kind === "AC") ? 2 : 1;',
    to: 'const floorN = 1; /* neg:samefloor1 */',
    why: '⭐ §2-11 の再現 — クランプ下限を AC/DC ともに 1 に固定 (攻撃の nat1 自動ミスを無視)' },

  samefloor2: { impl: true, file: 'index.html', targets: ['1f'],
    from: 'const floorN = (kind === "AC") ? 2 : 1;',
    to: 'const floorN = 2; /* neg:samefloor2 */',
    why: '⭐ §2-11 の再現 — クランプ下限を AC/DC ともに 2 に固定 (セーヴに無い特例を持ち込む)' },

  nocap: { impl: true, file: 'index.html', targets: ['1g', '1h'],
    from: 'const need   = (raw > 20) ? null : Math.max(floorN, raw);',
    to: 'const need   = Math.max(floorN, raw); /* neg:nocap */',
    why: 'raw > 20 の分岐を消して「出目 23+」を出す (会心のみ / 届かない が消える)' },

  xformlift: { impl: true, file: 'index.html', targets: ['5b'],
    from: '.rollPop.hasVerdict { margin-top: -16px; }',
    to: '.rollPop.hasVerdict { transform: translate(-50%, -16px); } /* neg:xformlift */',
    why: '⭐ 罠 C の再現 — CSS アニメーション (rollRise / rollCritBurst) が全キーフレームで'
      + ' transform を書いているので !important でない宣言は 100% 効かない' },

  /* ⚠⚠⚠ 中の `display: block;` は index.html 全体で非一意なので当て先にできない。
   *   規則の**開き括弧の行**を掴み、!important の宣言を先頭へ差し込む
   *   (同じ宣言ブロック内なら !important が後続の display: block に勝つ)。 */
  sidebyside: { impl: true, file: 'index.html', targets: ['5c'],
    from: '    .rollPop .verdictLine {',
    to: '    .rollPop .verdictLine { display: inline !important; /* neg:sidebyside */',
    why: '判定行を縦でなく横へ連結する (判定行が独立した行でなくなる / 吹き出しが横に膨らむ)' },

  clobber: { impl: true, file: 'index.html', targets: ['4a'],
    from: "return html + '<span class=\"verdictLine\">' + needTxt + ' → ' + verdict + margTxt + '</span>';",
    to: "return html.replace(/vs\\s+(AC|DC)\\s+(\\d+)/, '<span class=\"verdictLine\">' + needTxt + ' → '"
      + " + verdict + margTxt + '</span>'); /* neg:clobber */",
    why: '追加行を append でなく既存行 (vs AC 14) の置換にする (既存 3 行が壊れる)' },

  /* ⭐⭐⭐ 罠 D の再現は「順番を入れ替える」だけでは**原理的に赤にできない**。
   *   rollTargetLine は type 白名簿で "skill" を弾き html を同一のまま返すので、
   *   検出が html2 を読んでも `class="label">SKILL` も `class="big">` も無傷のまま
   *   (項目 2 の実測)。⇒ **注釈が SKILL の吹き出しに実際に触る**ところまで作らないと
   *   欠陥が発生しない。よって transform で次を同時に壊す:
   *     ① type 白名簿を外す         (SKILL も注釈対象になる)
   *     ② アンカーの AND を外す     (SKILL の実形は 1d20 / = / vs を 1 つも持たない)
   *     ③ append を **prepend** にし、注釈側に class="big"> と class="label">SKILL を含める
   *     ④ #37 の SKILL 検出を注釈より**後ろ**へ動かし html2 を読ませる
   *   ⭐ ③ で label も混ぜるのは、SKILL 以外 (仲間の攻撃ロール) でも検出が誤発火するようにして
   *     「仲間が技を使ったかどうかの run の運」に負のコントロールを預けないため。 */
  skillmangle: { impl: true, file: 'index.html', targets: ['4c'],
    transform: (body) => {
      const notes = [];
      const rep = (from, to, label) => {
        if (body.split(from).length - 1 !== 1) return false;
        body = body.split(from).join(to); notes.push(label); return true;
      };
      if (!rep('if (type !== "hit" && type !== "miss" && type !== "crit" && type !== "fumble") return html;',
        'if (false) return html; /* neg:skillmangle-1 白名簿を外す */', '①白名簿')) return null;
      if (!rep('const mNat = html.match(/1d20\\(<b>(\\d+)<\\/b>\\)/);',
        'const mNat = html.match(/1d20\\(<b>(\\d+)<\\/b>\\)/) || ["", "0"]; /* neg:skillmangle-2 */',
        '②mNat')) return null;
      if (!rep('const mTot = html.match(/=\\s*(?:<span class="big">)?(-?\\d+)/);',
        'const mTot = html.match(/=\\s*(?:<span class="big">)?(-?\\d+)/) || ["", "0"]; /* neg:skillmangle-3 */',
        '②mTot')) return null;
      if (!rep('const mTgt = html.match(/vs\\s+(AC|DC)\\s+(\\d+)/);',
        'const mTgt = html.match(/vs\\s+(AC|DC)\\s+(\\d+)/) || ["", "AC", "0"]; /* neg:skillmangle-4 */',
        '②mTgt')) return null;
      if (!rep('if (!mNat || !mTot || !mTgt) return html;',
        '/* neg:skillmangle-5 AND を外す */', '②AND')) return null;
      if (!rep("return html + '<span class=\"verdictLine\">' + needTxt + ' → ' + verdict + margTxt + '</span>';",
        "return '<span class=\"verdictLine\">' + needTxt + ' → ' + verdict + margTxt"
        + " + '<b class=\"big\">判定</b><span class=\"label\">SKILL</span></span>' + html;"
        + " /* neg:skillmangle-6 前置 */", '③前置')) return null;
      /* ④ #37 の検出ブロックを丸ごと外し、注釈の**後ろ**へ html2 を読む形で置き直す。 */
      const CR = '\r\n';
      const DET =
        "      if (html && html.indexOf('class=\"label\">SKILL') >= 0) {" + CR +
        "        const m = html.match(new RegExp('class=\"big\">([^<]*)'));" + CR +
        '        if (m && m[1]) RunChronicle.usedSkill(m[1]);' + CR +
        '      }' + CR;
      if (body.split(DET).length - 1 !== 1) return null;
      body = body.split(DET).join('');
      const ANCHOR = '      const html2 = rollTargetLine(html, type);';
      const at = body.lastIndexOf(ANCHOR);     // ⭐ showRollAtAlly = 3 関数のうち最後
      if (at < 0) return null;
      body = body.slice(0, at + ANCHOR.length) + CR +
        "      if (html2 && html2.indexOf('class=\"label\">SKILL') >= 0) { /* neg:skillmangle-7 */" + CR +
        "        const m = html2.match(new RegExp('class=\"big\">([^<]*)'));" + CR +
        '        if (m && m[1]) RunChronicle.usedSkill(m[1]);' + CR +
        '      }' + body.slice(at + ANCHOR.length);
      notes.push('④検出を注釈後へ移動');
      return { body: body, note: notes.join(' / ') };
    },
    verifyServed: (pure, mut) => {
      const c = (h, n) => h.split(n).length - 1;
      const READS_NEW = "if (html2 && html2.indexOf('class=\"label\">SKILL') >= 0)";
      const READS_OLD = "if (html && html.indexOf('class=\"label\">SKILL') >= 0)";
      const ok = c(pure, 'neg:skillmangle') === 0 && c(mut, 'neg:skillmangle') === 7
        && c(pure, READS_OLD) === 1 && c(mut, READS_OLD) === 0
        && c(pure, READS_NEW) === 0 && c(mut, READS_NEW) === 1;
      return [ok, '注入マーカー 素 ' + c(pure, 'neg:skillmangle') + ' / 変異 '
        + c(mut, 'neg:skillmangle') + ' 箇所  SKILL 検出が読む変数: 素=html('
        + c(pure, READS_OLD) + ') 変異=html2(' + c(mut, READS_NEW) + ')'];
    },
    why: '⭐ 罠 D の再現 — 注釈が #37 の SKILL 検出**より前**に入り、年代記が'
      + ' 技名でなく注釈の中身 (class="big">判定) を拾う' },

  alltypes: { impl: true, file: 'index.html', targets: ['3a'],
    from: 'if (type !== "hit" && type !== "miss" && type !== "crit" && type !== "fumble") return html;',
    to: 'if (false) return html; /* neg:alltypes 白名簿を外す */',
    why: 'type の白名簿を外して skill / init / buff も注釈する (対象外が壊れる)' },

  /* ⚠⚠⚠ 依頼書は「mTot を条件から外す」と書いているが、それだけでは **(3b)(3c) は緑のまま**。
   *   実測: FUMBLE! の実形は `=` も `vs` も両方無く、INITIATIVE の形は `vs` が無い。
   *   ⇒ AND を **2 本**外す (§8 の「条件が 1 本とは限らない」がまさにこれ)。
   *   ⚠ 素の `if (!mNat || !mTot || !mTgt)` を消すだけだと mTot が null のまま
   *     `mTot[1]` で TypeError になり「測れないから赤」に化けるので、
   *     既定値を与えて **注釈が実際に出てしまう**形にする。 */
  looseanchor: { impl: true, file: 'index.html', targets: ['3b', '3c'],
    edits: [
      { from: 'const mTot = html.match(/=\\s*(?:<span class="big">)?(-?\\d+)/);',
        to: 'const mTot = html.match(/=\\s*(?:<span class="big">)?(-?\\d+)/) || ["", "0"]; /* neg:looseanchor-1 */' },
      { from: 'const mTgt = html.match(/vs\\s+(AC|DC)\\s+(\\d+)/);',
        to: 'const mTgt = html.match(/vs\\s+(AC|DC)\\s+(\\d+)/) || ["", "AC", "0"]; /* neg:looseanchor-2 */' },
      { from: 'if (!mNat || !mTot || !mTgt) return html;',
        to: 'if (!mNat) return html; /* neg:looseanchor-3 AND を 2 本外す */' },
    ],
    why: '⭐ §4-5 の AND を 2 本外す — 「= 合計」も「vs 目標」も無い FUMBLE! /'
      + ' INITIATIVE まで注釈する' },

  retreatdead: { impl: true, file: 'index.html', targets: ['6a', '6b'],
    from: 'if (!ROLL_TARGET_ON) return html;',
    to: 'if (false && !ROLL_TARGET_ON) return html; /* neg:retreatdead */',
    why: '撤退スイッチの判定を消して常に注釈する (?rolltarget=0 が効かない)' },

  /* ⚠ 宣言は 2 行 (`const ROLL_TARGET_ON =` / 次行が式)。const の行は他所と紛れるので
   *   **式の行**を差し替える。 */
  retreatall: { impl: true, file: 'index.html', targets: ['0d'],
    from: 'new URLSearchParams(window.location.search).get("rolltarget") !== "0";',
    to: 'false; /* neg:retreatall 常に OFF */',
    why: '逆に常に false にして注釈を一切しない (⭐ (0d) の母集団ガードそのものを検査する)' },
};
const MUT_ORDER = ['noseam', 'onlyplayer', 'verdictbymath', 'singlemod', 'nobr',
  'samefloor1', 'samefloor2', 'nocap', 'xformlift', 'sidebyside', 'clobber',
  'skillmangle', 'alltypes', 'looseanchor', 'retreatdead', 'retreatall'];
const MUT_IMPL = MUT_ORDER.filter(k => MUTATIONS[k].impl);
const MUT_SERVED = MUT_IMPL.filter(k => !MUTATIONS[k].driver);
const MUT_TODO = MUT_ORDER.filter(k => !MUTATIONS[k].impl);

/* ⭐ 対照ページ (?rolltarget=0) を必要とする assert。⛔ 全変異で対照を開くと走行時間が
 *  倍になるだけなので、targets / record にこれらを含む変異のときだけ開く (項目 3 が使う)。 */
const REF_ASSERTS = { '6a': 1, '6b': 1 };
/* ⭐ 実プレイ (?autoplay で戦闘を回す) を必要とする assert。⛔ これ以外しか見ない変異では
 *  measurePlay を回さない。実測 1 走 ≒ 90 秒 なので、16 本すべてで回すと 25 分かかるが
 *  実際に実プレイが要るのは 5 本だけ ((6a)(6b) は撤退アーム = REF_ASSERTS 側)。
 *  ⚠ 母集団の意味は変わらない — 走らせないのは「その assert が読まないデータ」だけ。 */
const PLAY_ASSERTS = { '0a': 1, '0c': 1, '0d': 1, '4c': 1, '5a': 1, '5b': 1, '5c': 1 };

if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) {
  console.error('[drv] 未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')');
  process.exit(3);
}
if (MUTATE !== null && !MUTATIONS[MUTATE].impl) {
  console.error('[drv] --mutate ' + MUTATE + ' はまだ実装されていない (PENDING): ' + MUTATIONS[MUTATE].why);
  process.exit(3);
}

/* ⭐⭐⭐ 配信バイトの凍結。⚠ アンカーが 1 箇所にヒットしなければここで exit 3。
 *  ⛔ リクエストのたびに fs.readFileSync しない — 別窓が index.html を保存すると
 *     走行中に「素の行」と「変異後の行」が混ざったビルドを配ってしまう。
 *  ⭐ 変異は 2 通り: ① from/to (または edits) の**逐語置換** ② transform の**変換関数**。
 *  ⚠ 項目 1 では MUT_SERVED が空なのでこのループは 1 周もしない (正しい)。 */
const SRC = {};
const MUT_SRC = {};
function editsOf(m) { return m.edits ? m.edits : [{ from: m.from, to: m.to }]; }
for (const k of MUT_SERVED) {
  const m = MUTATIONS[k];
  if (!SRC[m.file]) SRC[m.file] = fs.readFileSync(path.join(ROOT, m.file), 'utf8');
  let body = SRC[m.file];
  if (typeof m.transform === 'function') {
    const t = m.transform(body);
    if (!t || typeof t.body !== 'string' || t.body === body) {
      console.error('[drv] ⛔ 変異 ' + k + ' の transform が ' + m.file
        + ' を 1 バイトも変えなかった → 負のコントロールが空振りする');
      process.exit(3);
    }
    MUT_SRC[k] = { file: m.file, body: t.body, note: t.note || '' };
    continue;
  }
  const eds = editsOf(m);
  for (let i = 0; i < eds.length; i++) {
    const e = eds[i];
    const at = ' 変異 ' + k + (eds.length > 1 ? ' の置換 ' + (i + 1) + '/' + eds.length : '');
    if (typeof e.from !== 'string' || typeof e.to !== 'string') {
      console.error('[drv] ⛔' + at + ' の from/to が文字列でない'); process.exit(3);
    }
    if (e.from.indexOf('\n') >= 0) {
      console.error('[drv] ⛔' + at + ' の置換文字列が複数行 (CRLF/LF 混在で必ず空振りする)'); process.exit(3);
    }
    if (e.from.length === e.to.length) {
      console.error('[drv] ⛔' + at + ' の置換前後が同じ長さ → 配信の検算が誤報する'); process.exit(3);
    }
    const n = body.split(e.from).length - 1;
    if (n !== 1) {
      console.error('[drv] ⛔' + at + ' の置換対象が ' + m.file + ' 内に ' + n
        + ' 箇所 → 負のコントロールが空振りする: ' + JSON.stringify(e.from.slice(0, 90)));
      process.exit(3);
    }
    body = body.split(e.from).join(e.to);
  }
  MUT_SRC[k] = { file: m.file, body: body };
}

// ══════════════════════════════════════════════════════════════════════════════
// puppeteer / Chrome / 内蔵サーバ
// ══════════════════════════════════════════════════════════════════════════════
function loadPuppeteer() {
  const tried = [];
  try { return require('puppeteer-core'); } catch (e) { tried.push('puppeteer-core'); }
  const scratch = path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core');
  try { return require(scratch); } catch (e) { tried.push(scratch); }
  if (process.env.PPTR_DIR) {
    const p = path.join(process.env.PPTR_DIR, 'node_modules', 'puppeteer-core');
    try { return require(p); } catch (e) { tried.push(p); }
  }
  console.error('[drv] puppeteer-core が見つかりません。試行: ' + tried.join(' / '));
  process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) {
    if (fs.existsSync(c)) return c;
  }
  console.error('[drv] Chrome/Edge が見つかりません。--browser <path> で指定してください。');
  process.exit(2);
}
/* ⚠⚠ MIME はモジュール直下に置く (helper へ切り出して取り込み漏れると
 *   startServer の try/catch に飲まれて全 500 になり「シームが undefined」に見える)。 */
const MIME = {
  '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml'
};

const PAGE_PATH = '/index.html';
/* 撤退のクエリ (依頼書 §7)。§6 (6a)(6b) が項目 2 で使う。 */
const RETREAT_QUERY = '?rolltarget=0';
/* シナリオは **廃坑 (goblin-mine = シナリオ1)** に固定する (依頼書 §8 (0c))。 */
const SCENARIO_KEY = 'dragonfighters.currentScenario';
const SCENARIO_ID = 'goblin-mine';
/* 実プレイのクエリ。⭐ ?autoplay=N は sleepMs を 1/N に短縮して自動進行させる。
 * ⛔ ?diag=1 は付けない — 45 秒の combat-stall ウォッチドッグが console.error を出すが、
 *   それは**テスト時間の副作用でバグではない** (2026-06-08 の実測)。事故の籠を汚さない。 */
const PLAY_QUERY = 'autoplay=30';

function startServer(port, mutKey) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const rel = u.replace(/^\/+/, '');
        const ov = mutKey ? (MUT_SRC[mutKey] || null) : null;
        if (ov && rel === ov.file) {
          res.setHeader('Content-Type', MIME[path.extname(rel).toLowerCase()] || 'text/plain');
          res.setHeader('Cache-Control', 'no-store');
          res.end(ov.body); return;
        }
        const fp = path.join(ROOT, rel);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
          res.statusCode = 404; res.end('404'); return;
        }
        res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        fs.createReadStream(fp).pipe(res);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    srv.on('error', reject);
    srv.listen(port, () => resolve(srv));
  });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function httpGet(url) {
  return new Promise((res, rej) => {
    http.get(url, r => {
      let b = ''; r.setEncoding('utf8');
      r.on('data', c => b += c);
      r.on('end', () => res({ status: r.statusCode, body: b }));
    }).on('error', rej);
  });
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

/* ⚠⚠⚠ 母集団が立たなかったときの返し方。⛔ 「スキップして緑」は禁止。
 *  ⭐ 本体の assert は必ずこれを通して赤を返す = detail に `population: none` が出るので
 *    「測れないから赤」と「値が悪いから赤」が記録の上で区別できる。
 *  ⚠ 項目 2 以降が §1〜§6 を実装するときも、母集団ガードが偽の枝で **必ず** これを呼ぶこと。 */
function popFail(which, why) {
  return [false, 'population: none  (' + which + ' が立っていない: ' + why + ')'];
}

// ══════════════════════════════════════════════════════════════════════════════
// (0a)(0d) の測定パラメタ
// ══════════════════════════════════════════════════════════════════════════════
/* ⭐ 検証シームの名前。依頼書 §5-3 = `window.__rollTargetFmt = rollTargetLine;`。
 *  ⛔ 項目 2 が名前を変えるなら**ここ 1 箇所**を直す (assert 側に literal を散らさない)。 */
const SEAM_NAME = '__rollTargetFmt';
/* ⭐ 依頼書 §4-1 が「改名禁止」と名指しした 5 つの class。§1〜§5 が文字列で握る。 */
const CLS_VERDICT_LINE = 'verdictLine';
const CLS_NEED = 'need';
const CLS_WIN = 'win';
const CLS_LOSE = 'lose';
const CLS_MARG = 'marg';
/* ⭐ 依頼書 §2-3 の実測 = 注釈の対象になる type は 4 語だけ。 */
const ANNOT_TYPES = ['hit', 'miss', 'crit', 'fumble'];
/* (0c)(0d) の母集団の下限 (依頼書 §8 = 「1 枚以上」)。 */
const POP_MIN = 1;
/* 実プレイの観測窓。⭐ 固定 sleep ではなく「出るまでポーリング」(共有キューのある所で
 *  固定時間窓は原理的にフレークする = 2026-08-16 扉 P5 の教訓 ③)。
 *
 * ⚠⚠⚠ **打ち切りの条件は「.rollPop の総数」ではなく「注釈されるべき吹き出しの数」**。
 *   2026-09-04 の実走でこの罠を踏んだ: 総数 20 枚で打ち切ったところ、**24 枚が全部
 *   `INITIATIVE` (type=init)** だった。交戦の頭でイニシアチブが人数ぶん一斉に出るので、
 *   総数だけ見ていると**攻撃ロールが 1 枚も入らないうちに窓が閉じる**。
 *   結果 (0d) が `population: none` = 「測れないから赤」になり、
 *   本来測りたい「判定行が出ていないから赤」と区別がつかなくなった。
 *   ⭐ 一般形 = **母集団は「測りたい対象そのもの」で数えて打ち切る**
 *     ([[project-enemy-name-label]] の「母集団ヘルパを反対のアームに当てない」と同根)。 */
const PLAY_MAX_MS = 150000;      // 上限。ここに達したら諦めて観測できたぶんで判定する
const PLAY_ENOUGH_ANNOT = 8;     // §4-5 の AND を満たす吹き出しがこれだけ出たら打ち切る
const PLAY_CAP_POPS = 400;       // 観測器のリングの上限 (これ以上は溢れとして数えるだけ)
const PLAY_POLL_MS = 500;

// ══════════════════════════════════════════════════════════════════════════════
// (0b) 配信バイトから「吹き出しの生成点」を導出する
//   ⭐⭐⭐ 期待値を依頼書から写経しない。3 つの独立した数え方の一致だけを縛る。
//   ⛔ ディスクを読み直さない (走行中に別窓が保存すると混合ビルドを測ることになる)。
// ══════════════════════════════════════════════════════════════════════════════
const GEN_FN_PREFIX = 'function showRollAt';
/* 経路② = 「type を引数で受け取る吹き出しの生成点」の署名。⭐ showSkillAnnounce の
 *  `"rollPop skill"` / showBuffPop の `"rollPop buff"` は type を受け取らないので当たらない
 *  (= 依頼書 §2-1 が「対象外」と名指しした showBuffPop を自動的に除外する)。 */
const GEN_CLS_LINE = 'pop.className = "rollPop " + type;';
/* 経路③ = 注釈を通した代入 (依頼書 §5-4)。 */
const GEN_SET_NEW = 'pop.innerHTML = html2;';
/* 素の代入。⭐ どの生成点にも 1 つも残っていないことを (0b) が要求する。
 *  ⚠ `= html;` と `= html2;` は最後の 1 文字 (';' vs '2') で分かれるので前方一致の事故は起きない。 */
const GEN_SET_OLD = 'pop.innerHTML = html;';

const countOf = (hay, needle) => (needle && hay) ? (hay.split(needle).length - 1) : 0;

function genPointScan(html) {
  if (typeof html !== 'string' || html.length === 0) {
    return { ok: false, err: '配信バイトが空', defs: [] };
  }
  const defs = [];
  let i = 0;
  for (;;) {
    const at = html.indexOf(GEN_FN_PREFIX, i);
    if (at < 0) break;
    let j = at + 'function '.length, k = j;
    while (k < html.length && /[A-Za-z0-9_$]/.test(html.charAt(k))) k++;
    defs.push({ name: html.slice(j, k), at: at });
    i = at + GEN_FN_PREFIX.length;
  }
  if (defs.length === 0) {
    return { ok: false, err: '配信バイトに ' + GEN_FN_PREFIX + ' が 1 つも無い', defs: [] };
  }
  /* 各定義の本体 = 「次の同レベル function の直前」まで。
     ⚠ 最後の 1 本は次の定義が無いので、同じインデントの function を境界に使う
       (窓を固定長にすると無関係な showBuffPop まで巻き込む)。 */
  for (let n = 0; n < defs.length; n++) {
    const nextSame = html.indexOf('\n    function ', defs[n].at + 1);
    let end = (n + 1 < defs.length) ? defs[n + 1].at : html.length;
    if (nextSame > 0 && nextSame < end) end = nextSame;
    const body = html.slice(defs[n].at, end);
    defs[n].bytes = body.length;
    defs[n].newSet = countOf(body, GEN_SET_NEW);
    defs[n].oldSet = countOf(body, GEN_SET_OLD);
    defs[n].clsLine = countOf(body, GEN_CLS_LINE);
  }
  return {
    ok: true, err: null, defs: defs,
    nDef: defs.length,
    nCls: countOf(html, GEN_CLS_LINE),
    nNew: countOf(html, GEN_SET_NEW),
    nOld: countOf(html, GEN_SET_OLD),
    bytes: html.length,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// 純関数シームの呼び出し (§1〜§4 が項目 2 で使う。⭐ 実プレイに頼らない計測機構)
//   使い方: const r = await evalFmt(page, '1d20(<b>12</b>)+6 = 18<br>vs AC 14', 'hit');
//   ⭐ 戻り値は { ok, out, err }。⛔ 例外を握り潰して undefined を返さない
//     (シームが無いのに「入力と同じ」に見えると (3a) が自明に緑になる)。
// ══════════════════════════════════════════════════════════════════════════════
async function evalFmt(page, html, type) {
  return page.evaluate((seam, h, t) => {
    try {
      const f = window[seam];
      if (typeof f !== 'function') return { ok: false, out: null, err: 'seam is ' + typeof f };
      const r = f(h, t);
      return { ok: true, out: (typeof r === 'string') ? r : null,
               err: (typeof r === 'string') ? null : ('returned ' + typeof r) };
    } catch (e) { return { ok: false, out: null, err: String((e && e.message) || e) }; }
  }, SEAM_NAME, html, type);
}

// ══════════════════════════════════════════════════════════════════════════════
// 実プレイの観測 — ⭐ `.rollPop` は 1300〜1500ms で消えるので **MutationObserver** で拾う
//   ⛔ 固定時間のスナップショットで querySelectorAll('.rollPop') を撮らない
//     (その瞬間に 1 枚も生きていないと母集団 0 になり、実装の欠陥に見える)。
//   ⭐ 観測器は evaluateOnNewDocument でページのどのスクリプトより先に仕込む。
// ══════════════════════════════════════════════════════════════════════════════
async function measurePlay(browser, port, errs, opts) {
  opts = opts || {};
  const page = await browser.newPage();
  const tag = '[:' + port + (opts.query ? ' ' + opts.query : '') + '] ';
  page.on('pageerror', e => errs.push(tag + 'PAGEERROR ' + e.message));
  page.on('console', mm => {
    if (mm.type() !== 'error') return;
    let url = '';
    try { url = (mm.location() && mm.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(url)) return;      // ⚠ 除外はこの 1 本の URL だけに絞る
    errs.push(tag + 'CONSOLE ' + mm.text() + (url ? ' <' + url + '>' : ''));
  });
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  /* ⚠ evaluateOnNewDocument は**全ナビゲーションで再実行される**。
     ここには消去系 (removeItem) を置かない (2026-06-05 の最頻ハマり)。 */
  await page.evaluateOnNewDocument((k, v, cap, pat) => {
    try { sessionStorage.setItem(k, v); } catch (e) {}
    window.__rtSeen = [];
    window.__rtOverflow = 0;
    /* ⭐ 打ち切りの判断にだけ使う「注釈されるべきか」の目印。
       ⛔ **判定の権威ではない** — assert が使うのは Node 側の isAnnotatable()。
       ⚠ 総数で打ち切ると交戦頭の INITIATIVE だけで窓が閉じる (2026-09-04 の実走で踏んだ)。 */
    const reNat = new RegExp(pat.nat), reTot = new RegExp(pat.tot), reTgt = new RegExp(pat.tgt);
    const annOf = (cls, html) => {
      const parts = String(cls || '').split(/\s+/);
      let hasType = false;
      for (let i = 0; i < pat.types.length; i++) if (parts.indexOf(pat.types[i]) >= 0) hasType = true;
      return hasType && reNat.test(html) && reTot.test(html) && reTgt.test(html);
    };
    try {
      const rec = (node) => {
        if (!node || node.nodeType !== 1) return;
        if (!node.classList || !node.classList.contains('rollPop')) return;
        if (window.__rtSeen.length >= cap) { window.__rtOverflow++; return; }
        let inner = '';
        try { inner = node.innerHTML || ''; } catch (e) {}
        let vc = -1, hv = false;
        try { vc = node.querySelectorAll('.verdictLine').length; } catch (e) {}
        try { hv = node.classList.contains('hasVerdict'); } catch (e) {}
        /* ⭐ (5b)(5c) の計測。⚠ **挿入された瞬間**に採る (吹き出しは 1300ms で消えるので
           あとからまとめて測ることができない)。⚠ marginTop を読むのは罠 C の回避
           (transform は rollRise が全キーフレームで書くので、実装が正しくても
            間違っていても同じ値が返る = 永久緑)。 */
        let mt = null, w = -1, vw = -1, cw = -1;
        try {
          const cs = window.getComputedStyle(node);
          mt = cs.marginTop;
          /* ⭐ (5c) の 2 本目 = 「判定行が**独立した行**になっている」。
             ブロックの子は器の内容幅いっぱいに広がるので vw === cw。横へ連結すると
             判定行は自分の文字幅しか持たないので vw < cw になる。
             ⛔ display の値そのものは読まない (実装手段を縛らない)。 */
          const vl = node.querySelector ? node.querySelector('.verdictLine') : null;
          if (vl) {
            vw = vl.offsetWidth;
            cw = node.clientWidth
              - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
          }
        } catch (e) {}
        try { w = node.offsetWidth; } catch (e) {}
        const cls = node.className || '';
        window.__rtSeen.push({
          cls: cls,
          html: inner.slice(0, 500),
          text: (node.textContent || '').slice(0, 200),
          verdictLines: vc,
          hasVerdictClass: hv,
          marginTop: mt,
          offsetWidth: w,
          verdictWidth: vw,
          contentWidth: cw,
          ann: annOf(cls, inner),
          t: Date.now(),
        });
      };
      const obs = new MutationObserver((muts) => {
        for (let a = 0; a < muts.length; a++) {
          const added = muts[a].addedNodes;
          for (let b = 0; b < added.length; b++) rec(added[b]);
        }
      });
      obs.observe(document, { childList: true, subtree: true });
      window.__rtObserver = obs;
    } catch (e) { window.__rtSeen = null; }
  }, SCENARIO_KEY, SCENARIO_ID, PLAY_CAP_POPS,
     { nat: RE_NAT.source, tot: RE_TOT.source, tgt: RE_TGT.source, types: ANNOT_TYPES });

  const url = 'http://localhost:' + port + PAGE_PATH + '?' + PLAY_QUERY
    + (opts.query ? '&' + String(opts.query).replace(/^[?&]/, '') : '');
  const out = { url: url, started: false, elapsedMs: 0, seen: [], overflow: 0,
                observerOk: false, seamType: null, seamProbe: null, err: null };
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    /* ⚠ 裸の識別子で待つ。classic script 直下の const/let/function は window に載らない。 */
    await page.waitForFunction(
      'typeof gameStarted !== "undefined" && gameStarted && document.getElementById("combatLog")',
      { timeout: 60000 });
    out.started = true;
  } catch (e) {
    out.err = 'ゲームが起動しなかった: ' + String((e && e.message) || e);
  }

  /* ⭐ (0a) の観測はここで採る (シームはブート時に載る = 起動さえすれば読める)。
     ⛔ 判定はしない。assert 側が突き合わせる。 */
  try {
    out.seamType = await page.evaluate((s) => typeof window[s], SEAM_NAME);
  } catch (e) { out.seamType = 'unreadable:' + String((e && e.message) || e); }
  /* ⭐ typeof だけでなく **1 回呼んでみた結果**も記録に残す (判定は (0a) の typeof のまま)。
     項目 2 がシームの戻り値の形を読み解くのに使う。 */
  try {
    out.seamProbe = await evalFmt(page,
      '<span class="label">HIT</span>1d20(<b>12</b>)+6 = <span class="big">18</span><br>vs AC 14', 'hit');
  } catch (e) { out.seamProbe = { ok: false, out: null, err: String((e && e.message) || e) }; }

  /* ── (4c) #37 の年代記シームのスパイ (罠 D の回帰検査) ──────────────────
     ⭐ RunChronicle は classic script 直下の const なので window に載らない。
       **文字列形式の evaluate** はグローバル eval なので裸名で届く (2026-06-08 の実測)。
     ⭐ 差し替えるのはオブジェクトの**メソッド 1 本**だけ。呼び口は
       `RunChronicle.usedSkill(...)` = 呼ぶたびにプロパティを引くので、差し替え後が効く。
     ⚠ 戦闘が始まる**前**に仕込む (gameStarted の直後にここへ来る)。
     ⚠ 呼び元の切り分けにスタックを使う (showRollAtAlly 経由かどうか)。⛔ 判定には
       使わない — 仲間が技を撃つかは run の運なので、判定は「1 件以上拾えた」だけ。 */
  try {
    out.chSpy = await page.evaluate(
      '(() => { try {' +
      '  window.__rtSkills = [];' +
      '  if (window.__rtSkillSpy) return "already";' +
      '  if (typeof RunChronicle === "undefined" || !RunChronicle' +
      '      || typeof RunChronicle.usedSkill !== "function") return "no RunChronicle";' +
      '  const orig = RunChronicle.usedSkill;' +
      '  RunChronicle.usedSkill = function (n) {' +
      '    try {' +
      '      let via = ""; try { via = (new Error()).stack || ""; } catch (e2) {}' +
      '      window.__rtSkills.push({ name: String(n), ally: via.indexOf("showRollAtAlly") >= 0 });' +
      '    } catch (e3) {}' +
      '    return orig.apply(RunChronicle, arguments);' +
      '  };' +
      '  window.__rtSkillSpy = true;' +
      '  let on = null; try { on = !!CHRONICLE_ON; } catch (e4) {}' +
      '  return "ok:CHRONICLE_ON=" + on;' +
      '} catch (e) { return "err:" + String((e && e.message) || e); } })()');
  } catch (e) { out.chSpy = 'err:' + String((e && e.message) || e); }

  /* ── 出るまでポーリング ────────────────────────────────────────────────── */
  if (out.started) {
    const t0 = Date.now();
    for (;;) {
      let snap = null;
      try {
        snap = await page.evaluate(() => ({
          n: Array.isArray(window.__rtSeen) ? window.__rtSeen.length : -1,
          a: Array.isArray(window.__rtSeen)
            ? window.__rtSeen.filter(function (x) { return x.ann; }).length : -1,
        }));
      } catch (e) { break; }
      /* ⭐ 打ち切りは **注釈されるべき吹き出しの数**で決める (⛔ 総数で決めない)。 */
      if (snap && snap.a >= PLAY_ENOUGH_ANNOT) break;
      if (snap && snap.n >= PLAY_CAP_POPS) break;    // リングが満杯 = これ以上待っても増えない
      if (Date.now() - t0 >= PLAY_MAX_MS) break;
      await sleep(PLAY_POLL_MS);
    }
    out.elapsedMs = Date.now() - t0;
  }
  try {
    const got = await page.evaluate(() => ({
      seen: Array.isArray(window.__rtSeen) ? window.__rtSeen : null,
      ov: window.__rtOverflow || 0,
      obs: !!window.__rtObserver,
      sk: Array.isArray(window.__rtSkills) ? window.__rtSkills : null,
    }));
    out.seen = got.seen || [];
    out.overflow = got.ov;
    out.observerOk = !!got.obs && Array.isArray(got.seen);
    out.skills = got.sk;    // (4c) 年代記が拾った技名 (null = スパイが立たなかった)
  } catch (e) {
    out.err = (out.err ? out.err + ' / ' : '') + '観測結果を読めない: ' + String((e && e.message) || e);
  }
  await page.close();
  return out;
}

/* ⭐⭐⭐ 撤退アーム専用の実プレイ。⚠ (6a)(6b) の母集団は「注釈対象になりうる .rollPop」で、
 *   これは戦闘の運で 0 枚になりうる (2026-09-04 の実走: 素のアームは 48.8 秒で 8 枚、
 *   撤退アームは 150 秒で 2 枚 = 同じ盤面でも 4 倍以上ばらつく)。
 *   ⛔ 0 枚を「判定行が無いから緑」にはしない (popFail が赤を返す) が、
 *     **偽の赤も出したくない**ので、0 枚のときだけ 1 回だけ引き直す
 *     ([[project_headless_verification]] の「単発の赤はまず 1 回再実行」を装置へ内蔵)。
 *   ⚠ 引き直すのは母集団が 0 のときだけ。⛔ 「判定行が出てしまった」ときに引き直さない
 *     (それをやると負のコントロールが空振りする)。 */
async function measureRetreat(browser, port, errs, opts) {
  let best = await measurePlay(browser, port, errs, opts);
  const annOf = (p) => popsOf(p).filter(isAnnotatable).length;
  if (best.started && best.observerOk && annOf(best) === 0) {
    errs.push('[ref :' + port + '] 注釈対象が 0 枚だったので 1 回だけ引き直す (母集団の運)');
    const again = await measurePlay(browser, port, errs, opts);
    if (annOf(again) > annOf(best)) { again.retried = true; best = again; }
    else { best.retried = true; }
  }
  return best;
}

// ══════════════════════════════════════════════════════════════════════════════
// 観測した .rollPop の分類 (⭐ 依頼書 §4-5 の AND をそのまま写す)
//   ⛔ ここで判定しない。母集団の切り出しだけを行う。
// ══════════════════════════════════════════════════════════════════════════════
const RE_NAT = /1d20\(<b>(\d+)<\/b>\)/;
const RE_TOT = /=\s*(?:<span class="big">)?(-?\d+)/;
const RE_TGT = /vs\s+(AC|DC)\s+(\d+)/;

function typeWordOf(cls) {
  const parts = String(cls || '').split(/\s+/);
  for (const t of ANNOT_TYPES) if (parts.indexOf(t) >= 0) return t;
  return null;
}
/* §4-5 の 4 条件を全部満たす = 「注釈されるべき吹き出し」。⭐ (0d) の真の母集団。 */
function isAnnotatable(row) {
  if (!row) return false;
  if (!typeWordOf(row.cls)) return false;
  const h = row.html || '';
  return RE_NAT.test(h) && RE_TOT.test(h) && RE_TGT.test(h);
}
function popsOf(play) { return (play && Array.isArray(play.seen)) ? play.seen : []; }
function popPops(m) { return popsOf(m && m.play); }
function popAnnotatable(m) { return popPops(m).filter(isAnnotatable); }
function popWithVerdict(m) { return popPops(m).filter(r => r && r.verdictLines > 0); }
/* ⭐ 撤退アーム (?rolltarget=0) 側。(6a)(6b) だけが読む。 */
function refPops(m) { return popsOf(m && m.ref); }
function refWithVerdict(m) { return refPops(m).filter(r => r && r.verdictLines > 0); }

/* ⭐⭐⭐ (4c) の 2 経路目 — 「プレイヤーが実際に見た技名」を DOM から取り出す。
 *  ⛔ 本番と同じ読み方 (html の**先頭から**最初の class="big">) をしてはいけない。
 *    罠 D は「注釈が検出点より前に入る」欠陥なので、同じ読み方をすると変異が両経路を
 *    等しく汚し、突き合わせが**循環して永久緑**になる ([[project-headless-verification]] の
 *    「実装とドライバが同じ誤りをしていると緑になる」①)。
 *  ⭐ 独立性の根拠 = **SKILL ラベルより後ろ**を読むこと。吹き出しの見た目上、技名は
 *    必ずラベルの後ろに出る。前置された偽の class="big"> はこの経路に入らない。 */
const SKILL_LABEL = 'class="label">SKILL';
const RE_BIG = /class="big">([^<]*)/;
function domSkillNameOf(html) {
  const h = String(html || '');
  const at = h.indexOf(SKILL_LABEL);
  if (at < 0) return null;
  const m = h.slice(at + SKILL_LABEL.length).match(RE_BIG);
  return (m && m[1]) ? m[1] : null;
}

// ══════════════════════════════════════════════════════════════════════════════
// §1〜§4 の合成入力 (⭐ 実プレイに頼らない計測。依頼書 §6「計測機構」)
//   ⛔ 期待値は 1 つも書かない。**入力の 4 数 (nat/total/kind/target) だけ**を持ち、
//      必要出目も超過幅もドライバが計算する (raw = target - total + nat)。
//   ⚠ 依頼書 §2-2 の罠 A = 判定行の HTML は 4 形態ある。a1/a2/a3/a4 がその 4 形態。
//   ⭐ fumble は**実プレイで 2 走とも 0 枚**だった (項目 1 の実測) ので、
//      (2c) の fumble 側はここでしか測れない。
// ══════════════════════════════════════════════════════════════════════════════
/* ⭐ (1a)〜(1h) が使う定数。⛔ need の literal は assert 側に散らさない。
 *  ⚠ 依頼書 §4-3 のクランプ表 — vs AC と vs DC で**規則が違う**。片方の写経は禁止。
 *    raw ≤ 1 → AC は 2 / DC は 1     (攻撃は nat1 が自動ミス。セーヴに特例なし)
 *    raw > 20 → AC は「会心のみ」 / DC は「届かない」 */
const FLOOR_AC = 2, FLOOR_DC = 1, CAP_RAW = 20;

const FMT_CASES = {
  /* ── 注釈されるもの (§4-5 の AND を 4 本とも満たす) ── */
  a1: { type: 'hit', nat: 12, total: 18, kind: 'AC', target: 14, form: 'A-1 (.big あり)',
    html: '<span class="label">HIT</span>1d20(<b>12</b>)+6 = <span class="big">18</span><br>vs AC 14' },
  a2: { type: 'hit', nat: 12, total: 18, kind: 'AC', target: 14, form: 'A-2 (.big なし)',
    html: '1d20(<b>12</b>)+6 = 18<br>vs AC 14' },
  a3: { type: 'hit', nat: 12, total: 18, kind: 'AC', target: 14, form: 'A-3 (<br> なし)',
    html: '1d20(<b>12</b>)+6 = 18 vs AC 14' },
  a4: { type: 'hit', nat: 14, total: 19, kind: 'DC', target: 15, form: 'A-4 (修正 2 項のセーヴ)',
    html: '1d20(<b>14</b>)+3装+2 = 19<br>vs DC 15' },
  lowAC: { type: 'hit', nat: 12, total: 30, kind: 'AC', target: 14, form: 'クランプ下限 (AC)',
    html: '1d20(<b>12</b>)+18 = 30<br>vs AC 14' },
  lowDC: { type: 'hit', nat: 12, total: 30, kind: 'DC', target: 14, form: 'クランプ下限 (DC)',
    html: '1d20(<b>12</b>)+18 = 30<br>vs DC 14' },
  capAC: { type: 'miss', nat: 5, total: 7, kind: 'AC', target: 25, form: 'クランプ上限 (AC)',
    html: '1d20(<b>5</b>)+2 = 7<br>vs AC 25' },
  capDC: { type: 'miss', nat: 5, total: 7, kind: 'DC', target: 25, form: 'クランプ上限 (DC)',
    html: '1d20(<b>5</b>)+2 = 7<br>vs DC 25' },
  miss1: { type: 'miss', nat: 5, total: 11, kind: 'AC', target: 14, form: '外れ (整合)',
    html: '<span class="label">MISS</span>1d20(<b>5</b>)+6 = 11<br>vs AC 14' },
  crit1: { type: 'crit', nat: 20, total: 26, kind: 'AC', target: 14, form: '会心 (整合)',
    html: '<span class="label">CRIT!</span>1d20(<b>20</b>)+6 = <span class="big">26</span><br>vs AC 14' },
  fumb1: { type: 'fumble', nat: 1, total: 7, kind: 'AC', target: 14, form: 'ファンブル (整合)',
    html: '1d20(<b>1</b>)+6 = 7<br>vs AC 14' },
  /* ⚠ 罠 B — type と算術が食い違う 2 形。⭐ 超過幅を出してはいけない側。 */
  critLow: { type: 'crit', nat: 20, total: 11, kind: 'AC', target: 14, form: '矛盾 (nat20 の脅威)',
    html: '<span class="label">CRIT!</span>1d20(<b>20</b>)+6 = 11<br>vs AC 14' },
  missHigh: { type: 'miss', nat: 8, total: 18, kind: 'AC', target: 14, form: '矛盾 (合計は届いているが外れ)',
    html: '<span class="label">MISS</span>1d20(<b>8</b>)+10 = 18<br>vs AC 14' },

  /* ── 注釈されないもの (out === input) ── */
  xSkill: { keep: true, type: 'skill', form: 'type=skill (vs AC を含むのに対象外)',
    html: '<span class="label">SKILL</span>1d20(<b>12</b>)+6 = <span class="big">18</span><br>vs AC 14' },
  xInit: { keep: true, type: 'init', form: 'type=init (vs AC を含むのに対象外)',
    html: '<span class="label">SKILL</span>1d20(<b>12</b>)+6 = <span class="big">18</span><br>vs AC 14' },
  xBuff: { keep: true, type: 'buff', form: 'type=buff (vs AC を含むのに対象外)',
    html: '<span class="label">SKILL</span>1d20(<b>12</b>)+6 = <span class="big">18</span><br>vs AC 14' },
  /* ⭐ FUMBLE! の実形 (index.html:22050 等の 12 箇所。`=` も `vs` も無い)。
     ⚠ type="fumble" は**白名簿に載っている** ので、これが素通りするのは
       §4-5 の「= 合計」「vs 目標」の AND が効いている証拠になる。 */
  xFumble: { keep: true, type: 'fumble', form: 'FUMBLE! の実形 (= も vs も無い)',
    html: '<span class="label">FUMBLE!</span>1d20(<b>1</b>)+6' },
  /* ⭐ INITIATIVE の実形 (index.html:20399 / :31465 …)。⚠ 本番テンプレは `1d20(${n})` で
       **`<b>` を付けない** (項目 1 のメモは `<b>8</b>` と書いていたが実テンプレは素の数値)。
     ⭐ 下の xInitHit は同じ形を**白名簿に載っている type** で通す = 「vs が無い」という
       AND の 1 本だけを孤立させて測る (type 白名簿に頼らない検査)。 */
  xInit2: { keep: true, type: 'init', form: 'INITIATIVE の実形 (vs が無い / 本番テンプレ)',
    html: '<span class="label">INITIATIVE</span>1d20(8)+1 = <span class="big">9</span>' },
  xInitHit: { keep: true, type: 'hit', form: 'INITIATIVE の形 + 白名簿の type (vs が無いことだけを測る)',
    html: '<span class="label">INITIATIVE</span>1d20(<b>8</b>)+1 = <span class="big">9</span>' },
  xHelpless: { keep: true, type: 'crit', form: 'HELPLESS! の実形 (index.html:22072)',
    html: '<span class="label">HELPLESS!</span>無抵抗の敵に自動命中 ×2' },
};
const FMT_ORDER = Object.keys(FMT_CASES);
/* 注釈されるはずのケース = (4a)(4b) の母集団。 */
const FMT_ANNOT = FMT_ORDER.filter(k => !FMT_CASES[k].keep);

/* ⭐⭐⭐ 期待値は**計算**で作る (依頼書 §4-2/§4-3。⛔ 依頼書の "8" を写経しない)。
 *   need === null は「20 でも届かない」= 数値を出さない側。 */
function expNeed(c) {
  const raw = c.target - c.total + c.nat;
  if (raw > CAP_RAW) return null;
  return Math.max(c.kind === 'AC' ? FLOOR_AC : FLOOR_DC, raw);
}
function expWon(c) { return c.type === 'hit' || c.type === 'crit'; }
function expMargin(c) { return c.total - c.target; }
function expShowMargin(c) { return expWon(c) === (expMargin(c) >= 0); }
function expMarginTxt(c) { const g = expMargin(c); return (g >= 0 ? '+' : '') + g; }

/* class 名で中身を取り出す (⭐ 縛るのは class 名だけ。文言は縛らない)。 */
function inner(out, tag, cls) {
  const m = String(out == null ? '' : out)
    .match(new RegExp('<' + tag + ' class="' + cls + '">([^<]*)</' + tag + '>'));
  return m ? m[1] : null;
}
function hasCls(out, cls) { return String(out == null ? '' : out).indexOf('class="' + cls + '"') >= 0; }
function needTxtOf(out) { return inner(out, 'b', CLS_NEED); }
function margTxtOf(out) { return inner(out, 'span', CLS_MARG); }

/* シームの生の結果を取り出す。⛔ 例外や非文字列を「入力と同じ」に丸めない
 *  (丸めると (3a)〜(3d) が自明に緑になる)。 */
function fmtRow(m, id) { return (m && m.fmt && m.fmt[id]) ? m.fmt[id] : null; }
/* [ok, detail] を返す共通ガード。ok が false ならそのまま assert の戻りに使う。 */
function fmtGuard(m, ids) {
  if (!m || !m.fmt) return popFail('シームの合成入力', 'measureFmt が走っていない');
  for (const id of ids) {
    const r = fmtRow(m, id);
    if (!r) return popFail('合成入力 ' + id, 'ケースが記録されていない');
    if (!r.ok || typeof r.out !== 'string') {
      return popFail('合成入力 ' + id, 'シームが文字列を返さなかった: ' + (r.err || '—'));
    }
  }
  return null;
}
const fmtOut = (m, id) => fmtRow(m, id).out;

// ══════════════════════════════════════════════════════════════════════════════
// 合成入力を window.__rollTargetFmt へ通す (⭐ 実プレイ不要 = 並走に強い)
//   ⚠ ?autoplay を付けない = ゲームを開始しない。純関数はブート時に載るので読める。
// ══════════════════════════════════════════════════════════════════════════════
async function measureFmt(browser, port, errs, opts) {
  opts = opts || {};
  const page = await browser.newPage();
  const tag = '[fmt :' + port + '] ';
  page.on('pageerror', e => errs.push(tag + 'PAGEERROR ' + e.message));
  page.on('console', mm => {
    if (mm.type() !== 'error') return;
    let url = '';
    try { url = (mm.location() && mm.location().url) || ''; } catch (e) {}
    if (/\/favicon\.ico$/.test(url)) return;
    errs.push(tag + 'CONSOLE ' + mm.text() + (url ? ' <' + url + '>' : ''));
  });
  await page.evaluateOnNewDocument((k, v) => {
    try { sessionStorage.setItem(k, v); } catch (e) {}
  }, SCENARIO_KEY, SCENARIO_ID);
  const url = 'http://localhost:' + port + PAGE_PATH
    + (opts.query ? String(opts.query).replace(/^&/, '?') : '');
  const res = {};
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    /* ⚠ シームが載るのを待つ。⛔ 待たずに測ると「未実装」と「まだ読み込み中」を取り違える。
       ⭐ 失敗しても止めない — (0a) が赤を出し、各 assert は fmtGuard で population: none。 */
    try {
      await page.waitForFunction(
        '(typeof window["' + SEAM_NAME + '"] === "function") || document.readyState === "complete"',
        { timeout: 30000 });
    } catch (e) { /* (0a) が記録する */ }
    for (const id of FMT_ORDER) {
      const c = FMT_CASES[id];
      res[id] = await evalFmt(page, c.html, c.type);
      res[id].input = c.html;
      res[id].type = c.type;
    }
  } catch (e) {
    errs.push(tag + 'FMT ' + String((e && e.message) || e));
  }
  await page.close();
  return res;
}

// ══════════════════════════════════════════════════════════════════════════════
// 受入条件 — [id, 見出し, m => [ok, detail]]
// ══════════════════════════════════════════════════════════════════════════════
const ASSERTS = [
  // ── §0 装置 (先に母集団を確かめる) ────────────────────────────────────────
  ['0a', '[装置] window.' + SEAM_NAME + ' が typeof === "function" である'
    + ' ⭐⭐⭐ これが無いと §1〜§4 の全 assert が例外か undefined で空振りする',
    m => {
      if (!m.play || !m.play.started) {
        return popFail('(0a) 実プレイの起動',
          'ゲームが起動しないとシームの有無も読めない: ' + ((m.play && m.play.err) || '—'));
      }
      const t = m.play.seamType;
      const ok = t === 'function';
      const p = m.play.seamProbe;
      return [ok,
        'typeof window.' + SEAM_NAME + ' = ' + JSON.stringify(t)
        + '  (試し呼び: ' + (p ? (p.ok ? JSON.stringify(String(p.out).slice(0, 90)) : '⛔ ' + p.err) : '—') + ')'
        + (ok ? '' : '  ⛔ 検証シームが本番に無い = 依頼書 §5-3 の '
          + 'window.' + SEAM_NAME + ' = rollTargetLine; が未実装')];
    }],

  ['0b', '[2 経路] 吹き出しの生成点を**依頼書から写経せず配信中の index.html から導出する** —'
    + ' ①`' + GEN_FN_PREFIX + '` の定義数 = ②`' + GEN_CLS_LINE + '` の数 = ③`' + GEN_SET_NEW + '` の数'
    + ' かつ どの定義の本体にも素の `' + GEN_SET_OLD + '` が残っていない'
    + ' ⭐ 生成点が 4 本目に増えたとき「注釈が抜けている」ならここで赤くなる',
    m => {
      const g = m.gen;
      if (!g || !g.ok) return [false, '⛔ 配信バイトから生成点を切り出せない: ' + (g && g.err)];
      const leftovers = g.defs.filter(d => d.oldSet > 0);
      const missing = g.defs.filter(d => d.newSet !== 1);
      const ok = g.nDef >= 1 && g.nDef === g.nCls && g.nDef === g.nNew
        && leftovers.length === 0 && missing.length === 0;
      return [ok,
        '配信 ' + g.bytes + 'B  ①定義 ' + g.nDef + ' 本 ' + JSON.stringify(g.defs.map(d => d.name))
        + '  ②"rollPop " + type の生成点 ' + g.nCls + ' 箇所'
        + '  ③html2 代入 ' + g.nNew + ' 箇所 / 素の html 代入 ' + g.nOld + ' 箇所'
        + '  内訳 ' + JSON.stringify(g.defs.map(d => d.name + ':new' + d.newSet + '/old' + d.oldSet))
        + (ok ? '' : '  ⛔ '
          + (g.nDef !== g.nCls ? '定義数と生成点数が食い違う ' : '')
          + (missing.length ? '注釈を通していない生成点: ' + missing.map(d => d.name).join(',') + ' ' : '')
          + (leftovers.length ? '素の代入が残っている: ' + leftovers.map(d => d.name).join(',') : ''))];
    }],

  ['0c', '[母集団] 実プレイ (シナリオ1 ' + SCENARIO_ID + ' を ?' + PLAY_QUERY + ' で回す) で'
    + ' `.rollPop` が ' + POP_MIN + ' 枚以上出ている'
    + ' ⭐ 0 枚なら §5/§6 の実プレイ assert は全部空振り',
    m => {
      const p = m.play;
      if (!p || !p.started) {
        return popFail('(0c) 実プレイの起動', (p && p.err) || 'measurePlay が走っていない');
      }
      if (!p.observerOk) {
        return popFail('(0c) 観測器', 'MutationObserver が仕込めていない (window.__rtSeen が配列でない)');
      }
      const pops = popPops(m), ann = popAnnotatable(m);
      const ok = pops.length >= POP_MIN;
      const kinds = {};
      for (const r of pops) {
        const t = typeWordOf(r.cls)
          || (String(r.cls || '').replace('rollPop', '').trim() || '?');
        kinds[t] = (kinds[t] || 0) + 1;
      }
      return [ok,
        '観測した .rollPop ' + pops.length + ' 枚 (' + (p.elapsedMs / 1000).toFixed(1)
        + ' 秒 / 打ち切り = 注釈されるべきものが ' + PLAY_ENOUGH_ANNOT + ' 枚 or '
        + (PLAY_MAX_MS / 1000) + ' 秒'
        + (p.overflow ? ' / 溢れ ' + p.overflow : '') + ')'
        + '  種別 ' + JSON.stringify(kinds)
        + '  うち §4-5 の AND を満たす (注釈されるべき) ' + ann.length + ' 枚'
        + (ok ? '' : '  ⛔ 戦闘が 1 度も起きていない = 実プレイ assert が全部空振りする')];
    }],

  ['0d', '[母集団] そのうち **`.' + CLS_VERDICT_LINE + '` を持つものが ' + POP_MIN + ' 枚以上**ある',
    m => {
      const p = m.play;
      if (!p || !p.started || !p.observerOk) {
        return popFail('(0d) 実プレイの観測', (p && p.err) || '(0c) が立っていない');
      }
      const pops = popPops(m), ann = popAnnotatable(m), v = popWithVerdict(m);
      if (pops.length < POP_MIN) {
        return popFail('(0d) .rollPop', '(0c) が 0 枚 = そもそも吹き出しが出ていない');
      }
      /* ⚠⚠⚠ 「注釈されるべき吹き出し」が 1 枚も出なかった run では、判定行が無いのが
         実装の欠陥なのか観測窓の運なのか区別できない。⭐ その区別を detail に出す。 */
      if (ann.length < POP_MIN) {
        return popFail('(0d) 注釈対象になりうる .rollPop',
          '観測した ' + pops.length + ' 枚のうち §4-5 の AND (type ∈ '
          + JSON.stringify(ANNOT_TYPES) + ' / 1d20(<b>N</b>) / = 合計 / vs AC|DC 目標) を'
          + '満たすものが 0 枚 — 観測窓を伸ばすか、戦闘が起きる盤面を作ること');
      }
      const ok = v.length >= POP_MIN;
      const sample = String(ann[0].text || '').replace(/\s+/g, ' ').slice(0, 70);
      return [ok,
        '.' + CLS_VERDICT_LINE + ' を持つ .rollPop ' + v.length + ' 枚'
        + ' / 注釈されるべき ' + ann.length + ' 枚 / 全 ' + pops.length + ' 枚'
        + '  hasVerdict class つき ' + pops.filter(r => r.hasVerdictClass).length + ' 枚'
        + '  例: ' + JSON.stringify(sample)
        + (ok ? '' : '  ⛔ 判定行が 1 枚も出ていない = 依頼書 §5-3/§5-4 が未実装')];
    }],

  // ── §1 必要出目 ───────────────────────────────────────────────────────────
  /* ⭐ 共通の型: ドライバが raw = target - total + nat を**自分で計算**し、
     `<b class="need">` の中身と突き合わせる。⛔ 依頼書の "8" を写経しない。 */
  ...[['1a', 'a1'], ['1b', 'a2'], ['1c', 'a3'], ['1d', 'a4'],
      ['1e', 'lowAC'], ['1f', 'lowDC']].map(([id, key]) => [id,
    (() => { const c = FMT_CASES[key];
      return '[必要出目] ' + c.form + ' — ' + JSON.stringify(c.html.slice(0, 64))
        + ' / type="' + c.type + '" → <b class="' + CLS_NEED + '"> が '
        + '**目標 - 合計 + 出目 をドライバが計算した値**と一致する'; })(),
    m => {
      const g = fmtGuard(m, [key]); if (g) return g;
      const c = FMT_CASES[key];
      const want = String(expNeed(c)) + '+';
      const got = needTxtOf(fmtOut(m, key));
      /* ⭐ (1e)/(1f) は「AC と DC で下限の規則が違う」ことも同時に縛る (§2-11)。 */
      let extra = '', ok = (got === want);
      if (id === '1f') {
        const g2 = fmtGuard(m, ['lowAC']); if (g2) return g2;
        const acTxt = needTxtOf(fmtOut(m, 'lowAC'));
        extra = '  / vs AC の同条件 = ' + JSON.stringify(acTxt);
        if (acTxt === got) { ok = false; extra += '  ⛔ AC と DC が同じ値 = クランプ下限が 1 本しかない'; }
      }
      return [ok, 'raw = ' + c.target + ' - ' + c.total + ' + ' + c.nat
        + ' = ' + (c.target - c.total + c.nat) + ' → 期待 ' + JSON.stringify(want)
        + ' / 実測 ' + JSON.stringify(got) + extra];
    }]),

  ...[['1g', 'capAC'], ['1h', 'capDC']].map(([id, key]) => [id,
    '[必要出目] ' + FMT_CASES[key].form + ' — raw > ' + CAP_RAW
      + ' のとき <b class="' + CLS_NEED + '"> は**数値を出さない**'
      + (id === '1h' ? '  ⭐ かつ vs AC の表記と異なる (救済の有無が違う)' : ''),
    m => {
      const g = fmtGuard(m, [key]); if (g) return g;
      const c = FMT_CASES[key];
      const raw = c.target - c.total + c.nat;
      const got = needTxtOf(fmtOut(m, key));
      const numeric = /^\d+\+$/.test(String(got));
      let ok = (expNeed(c) === null) && got !== null && got !== '' && !numeric;
      let extra = '';
      if (id === '1h') {
        const g2 = fmtGuard(m, ['capAC']); if (g2) return g2;
        const acTxt = needTxtOf(fmtOut(m, 'capAC'));
        extra = '  / vs AC の同条件 = ' + JSON.stringify(acTxt);
        if (acTxt === got) { ok = false; extra += '  ⛔ AC と DC が同じ表記 = 上限の分岐が 1 本しかない'; }
      }
      return [ok, 'raw = ' + raw + ' (> ' + CAP_RAW + ') → 実測 ' + JSON.stringify(got)
        + (numeric ? '  ⛔ 数値のまま出ている (クランプ上限の分岐が無い)' : '') + extra];
    }]),

  // ── §2 勝敗と超過幅 ───────────────────────────────────────────────────────
  ...[['2a', ['a1']], ['2b', ['miss1']], ['2c', ['crit1', 'fumb1']]].map(([id, keys]) => [id,
    '[勝敗] ' + keys.map(k => 'type="' + FMT_CASES[k].type + '" → class="'
      + (expWon(FMT_CASES[k]) ? CLS_WIN : CLS_LOSE) + '" を含み class="'
      + (expWon(FMT_CASES[k]) ? CLS_LOSE : CLS_WIN) + '" を含まない').join(' / ')
      + '  ⭐ 勝敗は type から引く (算術から引くと罠 B)',
    m => {
      const g = fmtGuard(m, keys); if (g) return g;
      const bad = [], notes = [];
      for (const k of keys) {
        const out = fmtOut(m, k), won = expWon(FMT_CASES[k]);
        const wantCls = won ? CLS_WIN : CLS_LOSE, badCls = won ? CLS_LOSE : CLS_WIN;
        const ok = hasCls(out, wantCls) && !hasCls(out, badCls);
        notes.push(k + '(' + FMT_CASES[k].type + '): ' + (ok ? '○' : '⛔')
          + ' ' + JSON.stringify(String(out).slice(FMT_CASES[k].html.length)));
        if (!ok) bad.push(k);
      }
      return [bad.length === 0, notes.join('  ')];
    }]),

  ['2d', '[超過幅] `<span class="' + CLS_MARG + '">` の中身が **合計 - 目標** と一致する'
    + ' (⭐ 数値はドライバが計算する。⛔ 依頼書の +4 / -3 を写経しない)',
    m => {
      const keys = ['a1', 'miss1'];
      const g = fmtGuard(m, keys); if (g) return g;
      const bad = [], notes = [];
      for (const k of keys) {
        const c = FMT_CASES[k], want = expMarginTxt(c), got = margTxtOf(fmtOut(m, k));
        notes.push(k + ': ' + c.total + ' - ' + c.target + ' = 期待 ' + JSON.stringify(want)
          + ' / 実測 ' + JSON.stringify(got));
        if (got !== want) bad.push(k);
      }
      return [bad.length === 0, notes.join('  ')];
    }],

  ...[['2e', 'critLow'], ['2f', 'missHigh']].map(([id, key]) => [id,
    '[矛盾] ' + FMT_CASES[key].form + ' — class="'
      + (expWon(FMT_CASES[key]) ? CLS_WIN : CLS_LOSE) + '" は出るが class="' + CLS_MARG
      + '" は出ない  ⭐ 矛盾した数字を出すくらいなら数字を落とす (§4-4)',
    m => {
      const g = fmtGuard(m, [key]); if (g) return g;
      const c = FMT_CASES[key], out = fmtOut(m, key);
      const wantCls = expWon(c) ? CLS_WIN : CLS_LOSE;
      const ok = hasCls(out, wantCls) && !hasCls(out, CLS_MARG);
      return [ok, 'type="' + c.type + '" / 合計 ' + c.total + ' vs 目標 ' + c.target
        + ' (算術の勝敗 = ' + (expMargin(c) >= 0 ? '成功' : '失敗')
        + ' / type の勝敗 = ' + (expWon(c) ? '成功' : '失敗') + ')'
        + '  → ' + JSON.stringify(String(out).slice(c.html.length))
        + (hasCls(out, CLS_MARG) ? '  ⛔ 超過幅が出ている (勝敗を算術から引いている疑い)' : '')];
    }]),

  // ── §3 対象外 (触らないもの) ──────────────────────────────────────────────
  ...[['3a', ['xSkill', 'xInit', 'xBuff']], ['3b', ['xFumble']],
      ['3c', ['xInit2', 'xInitHit']], ['3d', ['xHelpless']]].map(([id, keys]) => [id,
    '[対象外] ' + keys.map(k => FMT_CASES[k].form).join(' / ')
      + ' → **出力が入力と完全一致** (out === input)',
    m => {
      const g = fmtGuard(m, keys); if (g) return g;
      const bad = [], notes = [];
      for (const k of keys) {
        const c = FMT_CASES[k], out = fmtOut(m, k), ok = (out === c.html);
        notes.push(k + ': ' + (ok ? '○ 同一' : '⛔ ' + JSON.stringify(String(out).slice(0, 120))));
        if (!ok) bad.push(k);
      }
      return [bad.length === 0, notes.join('  ')];
    }]),

  // ── §4 恒等 (非退行) ──────────────────────────────────────────────────────
  ['4a', '[恒等] 注釈された出力は**入力を前方一致プレフィックスとして含む** (out.startsWith(input))'
    + '  ⭐ 既存 3 行が 1 文字も変わっていないことの機械証明 — 注釈対象 '
    + FMT_ANNOT.length + ' ケース全部',
    m => {
      const g = fmtGuard(m, FMT_ANNOT); if (g) return g;
      const bad = [];
      for (const k of FMT_ANNOT) {
        const c = FMT_CASES[k], out = fmtOut(m, k);
        if (!(out.startsWith(c.html) && out.length > c.html.length)) bad.push(k);
      }
      return [bad.length === 0, FMT_ANNOT.length + ' ケース中 ' + (FMT_ANNOT.length - bad.length)
        + ' 件が前方一致' + (bad.length ? '  ⛔ 崩れた: ' + bad.join(',')
          + '  例: ' + JSON.stringify(String(fmtOut(m, bad[0])).slice(0, 130)) : '')];
    }],

  ['4b', '[恒等] 追加分は `<span class="' + CLS_VERDICT_LINE + '">` で始まり `</span>` で終わる'
    + ' **1 塊のみ** (out.slice(input.length) を検査 / 判定行は出力全体でも 1 個)',
    m => {
      const g = fmtGuard(m, FMT_ANNOT); if (g) return g;
      const open = '<span class="' + CLS_VERDICT_LINE + '">';
      const bad = [];
      for (const k of FMT_ANNOT) {
        const c = FMT_CASES[k], out = fmtOut(m, k);
        if (!out.startsWith(c.html)) { bad.push(k + '(前方一致でない)'); continue; }
        const tail = out.slice(c.html.length);
        const nOpen = countOf(out, open);
        if (!(tail.startsWith(open) && tail.endsWith('</span>')
              && countOf(tail, open) === 1 && nOpen === 1)) bad.push(k);
      }
      return [bad.length === 0, FMT_ANNOT.length + ' ケース中 ' + (FMT_ANNOT.length - bad.length)
        + ' 件が「1 塊の追記」'
        + (bad.length ? '  ⛔ 崩れた: ' + bad.join(',') : '')
        + '  例: ' + JSON.stringify(String(fmtOut(m, 'a1')).slice(FMT_CASES.a1.html.length))];
    }],

  ['4c', '[恒等] #37 の年代記シーム: 実プレイで RunChronicle が技名を 1 件以上拾えており、'
    + 'かつ **showRollAtAlly 経由で拾った名前が、画面に出た吹き出しの技名と一致する**'
    + '  ⭐ 罠 D の回帰検査 (SKILL 検出より**後**に注釈しているか) — 2 経路照合',
    m => {
      const p = m.play;
      if (!p || !p.started) return popFail('(4c) 実プレイの起動', (p && p.err) || '—');
      if (!Array.isArray(p.skills)) {
        return popFail('(4c) 年代記スパイ', 'RunChronicle.usedSkill を差し替えられなかった: '
          + (p.chSpy || '—'));
      }
      const names = p.skills.map(s => s && s.name).filter(Boolean);
      const allyNames = p.skills.filter(s => s && s.ally).map(s => String(s.name));
      /* ── 経路① 年代記が拾った名前 (母集団ガード。⛔ ここは弱めない) ── */
      if (names.length < 1) {
        return [false, '拾った技名 0 件  spy=' + JSON.stringify(p.chSpy || null)
          + '  ⛔ 1 件も拾えていない = 罠 D (SKILL 検出より前に注釈した) の疑い'];
      }
      /* ── 経路② 観測した吹き出しの DOM (SKILL ラベルより**後ろ**の class="big">) ── */
      const dom = {};
      let nSkillPops = 0;
      for (const r of popPops(m)) {
        const nm = domSkillNameOf(r.html);
        if (nm === null) continue;
        nSkillPops++; dom[nm] = (dom[nm] || 0) + 1;
      }
      if (allyNames.length < 1) {
        return popFail('(4c) showRollAtAlly 経由の記録',
          '年代記は ' + names.length + ' 件拾ったが showRollAtAlly 由来が 0 件 '
          + '(仲間が 1 度も技を撃たなかった run) — 2 経路照合が測れない');
      }
      if (nSkillPops < 1) {
        return popFail('(4c) SKILL ラベルつきの .rollPop',
          '観測 ' + popPops(m).length + ' 枚のうち ' + SKILL_LABEL + ' を持つものが 0 枚');
      }
      const bad = allyNames.filter(n => !dom[n]);
      const ok = bad.length === 0;
      return [ok, '拾った技名 ' + names.length + ' 件 (うち showRollAtAlly 経由 '
        + allyNames.length + ' 件)  画面に出た SKILL 吹き出し ' + nSkillPops + ' 枚 = '
        + JSON.stringify(Object.keys(dom).slice(0, 6))
        + '  spy=' + JSON.stringify(p.chSpy || null)
        + (ok ? '  ○ 全部一致' : '  ⛔ 画面に出ていない名前を年代記が拾っている: '
          + JSON.stringify(Array.from(new Set(bad)).slice(0, 5))
          + ' = 罠 D (注釈が SKILL 検出より前に入った)')];
    }],

  // ── §5 レイアウト ─────────────────────────────────────────────────────────
  ['5a', '[レイアウト] 実プレイで `.' + CLS_VERDICT_LINE + '` を持つ `.rollPop` は'
    + ' **hasVerdict class を持つ**',
    m => {
      const p = m.play;
      if (!p || !p.started || !p.observerOk) return popFail('(5a) 実プレイの観測', (p && p.err) || '—');
      const v = popWithVerdict(m);
      if (v.length < POP_MIN) return popFail('(5a) 判定行つきの .rollPop', '(0d) が 0 枚');
      const bad = v.filter(r => !r.hasVerdictClass);
      return [bad.length === 0, '判定行つき ' + v.length + ' 枚 / hasVerdict つき '
        + (v.length - bad.length) + ' 枚'
        + (bad.length ? '  ⛔ class が付いていない ' + bad.length + ' 枚: '
          + JSON.stringify(String(bad[0].cls)) : '')];
    }],

  ['5b', '[レイアウト] `.rollPop.hasVerdict` の getComputedStyle().marginTop が**負の値**'
    + '  ⚠ transform では検査しない (罠 C。rollRise の値が返って永久緑になる)',
    m => {
      const p = m.play;
      if (!p || !p.started || !p.observerOk) return popFail('(5b) 実プレイの観測', (p && p.err) || '—');
      const v = popWithVerdict(m);
      if (v.length < POP_MIN) return popFail('(5b) 判定行つきの .rollPop', '(0d) が 0 枚');
      const vals = v.map(r => parseFloat(r.marginTop));
      const bad = vals.filter(x => !(x < 0));
      const uniq = Array.from(new Set(v.map(r => String(r.marginTop))));
      return [bad.length === 0, '判定行つき ' + v.length + ' 枚の marginTop = ' + JSON.stringify(uniq)
        + (bad.length ? '  ⛔ 負でないものが ' + bad.length + ' 枚 (margin-top が効いていない'
          + ' = transform で逃がしている疑い)' : '')];
    }],

  /* ⚠⚠⚠ 依頼書 §8 (5c) は幅 200px だけを縛っているが、**実測でそれだけでは
   *   `sidebyside` (判定行を横へ連結する) を赤にできない**。素の吹き出しは 118〜126px で、
   *   判定行を inline にしても `vs AC 13` の行へ乗るだけなので 200px に届かない。
   *   ⇒ 期待値は 1 つも緩めず、AND を 1 本**増やす**:
   *     「判定行が独立した行になっている」= 判定行の幅が吹き出しの内容幅と一致する。
   *   ⭐ 依頼書 §4-1 の「判定は横でなく縦(1 行追加)に足す」を機械で守る形。
   *   ⛔ display の値そのものは読まない (block / flex / grid など実装手段を縛らない)。 */
  ['5c', '[レイアウト] `.' + CLS_VERDICT_LINE + '` を持つ `.rollPop` の offsetWidth が 200px 未満'
    + ' **かつ** 判定行が独立した行になっている (判定行の幅 === 吹き出しの内容幅)'
    + '  ⭐ 横に膨らんでいない (§2-7) / 横へ連結していない (§4-1) の 2 本',
    m => {
      const p = m.play;
      if (!p || !p.started || !p.observerOk) return popFail('(5c) 実プレイの観測', (p && p.err) || '—');
      const v = popWithVerdict(m);
      if (v.length < POP_MIN) return popFail('(5c) 判定行つきの .rollPop', '(0d) が 0 枚');
      const ws = v.map(r => r.offsetWidth);
      const bad = ws.filter(w => !(w > 0 && w < 200));
      const mx = Math.max.apply(null, ws), mn = Math.min.apply(null, ws);
      /* 計測できていない (verdictWidth < 0) 枚があれば「測れないから赤」= popFail 相当。 */
      const unmeasured = v.filter(r => !(r.verdictWidth > 0 && r.contentWidth > 0));
      if (unmeasured.length) {
        return popFail('(5c) 判定行の幅',
          v.length + ' 枚中 ' + unmeasured.length + ' 枚で .verdictLine の幅を採れていない');
      }
      const notOwnLine = v.filter(r => Math.abs(r.verdictWidth - r.contentWidth) > 1);
      const pairs = Array.from(new Set(v.map(r => r.verdictWidth + '/' + r.contentWidth)));
      return [bad.length === 0 && notOwnLine.length === 0,
        '判定行つき ' + v.length + ' 枚の offsetWidth = ' + mn + '〜' + mx + 'px'
        + '  判定行幅/内容幅 = ' + JSON.stringify(pairs.slice(0, 6))
        + (bad.length ? '  ⛔ 200px 以上 (または 0) が ' + bad.length + ' 枚 = 横に膨らんでいる' : '')
        + (notOwnLine.length ? '  ⛔ 判定行が内容幅いっぱいでないものが ' + notOwnLine.length
          + ' 枚 = 独立した行になっていない (横へ連結している)' : '')];
    }],

  // ── §6 撤退 ───────────────────────────────────────────────────────────────
  ['6a', '[撤退] ' + RETREAT_QUERY + ' で実プレイ → `.rollPop` は ' + POP_MIN
    + ' 枚以上出るが `.' + CLS_VERDICT_LINE + '` は **0 枚**'
    + '  ⭐⭐⭐ 母集団ガードを同じページで同時に測る (0 枚だけでは自明に緑になる)',
    m => {
      const r = m.ref;
      if (!r || !r.started || !r.observerOk) {
        return popFail('(6a) 撤退アームの実プレイ', (r && r.err) || 'measurePlay(ref) が走っていない');
      }
      const pops = refPops(m), v = refWithVerdict(m);
      if (pops.length < POP_MIN) {
        return popFail('(6a) 撤退アームの .rollPop', '吹き出しが 1 枚も出ていない = 空振り');
      }
      const ann = pops.filter(isAnnotatable);
      if (ann.length < POP_MIN) {
        return popFail('(6a) 撤退アームの注釈対象',
          pops.length + ' 枚のうち §4-5 の AND を満たすものが 0 枚 = 「判定行が 0」が自明に成立する');
      }
      return [v.length === 0, '撤退アーム: .rollPop ' + pops.length + ' 枚 / 注釈対象 '
        + ann.length + ' 枚 / 判定行 ' + v.length + ' 枚'
        + (v.length ? '  ⛔ ' + RETREAT_QUERY + ' でも判定行が出ている' : '')];
    }],

  ['6b', '[撤退] ' + RETREAT_QUERY + ' のページで hasVerdict class が **0 個**'
    + ' (margin-top も #49 以前へ戻る)',
    m => {
      const r = m.ref;
      if (!r || !r.started || !r.observerOk) {
        return popFail('(6b) 撤退アームの実プレイ', (r && r.err) || 'measurePlay(ref) が走っていない');
      }
      const pops = refPops(m);
      if (pops.length < POP_MIN) {
        return popFail('(6b) 撤退アームの .rollPop', '吹き出しが 1 枚も出ていない = 空振り');
      }
      const ann = pops.filter(isAnnotatable);
      if (ann.length < POP_MIN) {
        return popFail('(6b) 撤退アームの注釈対象',
          pops.length + ' 枚のうち §4-5 の AND を満たすものが 0 枚 = 自明に緑');
      }
      const hv = pops.filter(x => x.hasVerdictClass);
      return [hv.length === 0, '撤退アーム: .rollPop ' + pops.length + ' 枚 / 注釈対象 '
        + ann.length + ' 枚 / hasVerdict ' + hv.length + ' 個'
        + (hv.length ? '  ⛔ ' + RETREAT_QUERY + ' でも class が付いている' : '')];
    }],
];
const ASSERT_OF = {};
for (const a of ASSERTS) ASSERT_OF[a[0]] = a;

// ══════════════════════════════════════════════════════════════════════════════
// 節の枠組み (⭐ 後続の項目は keys へキーを足し、pend から同じキーを外すだけでよい)
//   ⛔ keys と pend の両方に同じキーを置かないこと (数が合わなくなる)。
//   ⛔ 節ごと削除しないこと — 削ると「宣言してから実装する」型そのものが消える。
// ══════════════════════════════════════════════════════════════════════════════
const SECTIONS = [
  { title: '§0 装置 (先に母集団を確かめる) — ⭐ ここが立たないと §1〜§6 は全部空振りで永久緑',
    keys: ['0a', '0b', '0c', '0d'], pend: [] },

  { title: '§1 必要出目 (⭐ 判定は `<b class="' + CLS_NEED + '">` の中身)'
      + ' — ⭐ 期待文字列は写経でなく **計算** (raw = 目標 - 合計 + 出目) で組む',
    keys: ['1a', '1b', '1c', '1d', '1e', '1f', '1g', '1h'], pend: [] },

  { title: '§2 勝敗と超過幅 — ⭐ 勝敗は必ず type から引く (算術から引くと罠 B を踏む)',
    keys: ['2a', '2b', '2c', '2d', '2e', '2f'], pend: [] },

  { title: '§3 対象外 (触らないもの) — ⛔ 出力が入力と**完全一致** (out === input)',
    keys: ['3a', '3b', '3c', '3d'], pend: [] },

  { title: '§4 恒等 (非退行) — ⭐ 既存 3 行が 1 文字も変わっていないことの機械証明',
    keys: ['4a', '4b', '4c'], pend: [] },

  { title: '§5 レイアウト — ⚠ transform では検査しない (罠 C。アニメーション中の値を読むと永久緑)',
    keys: ['5a', '5b', '5c'], pend: [] },

  { title: '§6 撤退 ' + RETREAT_QUERY + ' — ⭐⭐⭐ 「0 枚」だけでは自明に緑になりうるので'
      + ' 同じページで (0c) の母集団ガードを必ず同時に測る',
    keys: ['6a', '6b'], pend: [] },
];
// ══════════════════════════════════════════════════════════════════════════════
// 本体
// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  const puppeteer = loadPuppeteer();
  const profile = require('./_pptr_profile')('df_rolltarget_');
  const browserPath = findBrowser();
  const PORT_OF = {};
  /* ⚠ ポートは **MUT_ORDER の並び**で固定的に割り当てる (impl の増減で番号が動かないように)。
     9881〜9896 が変異 16 本ぶん (予約は 9897 まで)。撤退アームの基準ページは 9898。 */
  MUT_ORDER.forEach((k, i) => { PORT_OF[k] = PORT + 1 + i; });
  const RETREAT_PORT = PORT + 18;

  console.log('=== verify_roll_target.js'
    + (NEGATIVE ? '  [負のコントロール]' : (MUTATE ? '  [変異 ' + MUTATE + ']' : '')) + ' ===');
  console.log('[drv] serving ' + ROOT);
  console.log('[drv]   base:' + PORT + '   撤退アーム:' + RETREAT_PORT + ' (' + RETREAT_QUERY + ')'
    + (MUT_SERVED.length ? '   ' + MUT_SERVED.map(k => k + ':' + PORT_OF[k]).join(' / ')
      : '   (変異は 1 本も実装されていない = 項目 3 の担当)'));

  /* ⭐ 撤退アームを見る assert ((6a)(6b)) はまだ 1 本も実装されていないので、
     項目 1 が実際に listen するのは base の 1 本だけ。⛔ 使わないポートは開かない。 */
  const needRetreat = !NEGATIVE && SECTIONS.some(s => s.keys.some(k => REF_ASSERTS[k]));
  const servers = [await startServer(PORT, (MUTATE && MUT_SRC[MUTATE]) ? MUTATE : null)];
  if (needRetreat) servers.push(await startServer(RETREAT_PORT, null));
  if (NEGATIVE) for (const k of MUT_SERVED) servers.push(await startServer(PORT_OF[k], k));

  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--user-data-dir=' + profile, '--no-sandbox', '--no-first-run',
      '--no-default-browser-check', '--disable-dev-shm-usage', '--disable-extensions',
      '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });

  const errs = [];

  try {
    if (!NEGATIVE) {
      // ══ 受入条件 ═══════════════════════════════════════════════════════════
      /* ⭐ (0b) の 2 経路目 = **配信バイト**。⛔ ディスクを読み直さない
         (走行中に別窓が保存すると混合ビルドを測ることになる)。 */
      const served = await httpGet('http://localhost:' + PORT + PAGE_PATH);
      const m = { gen: genPointScan(served.body), servedBytes: served.body.length, errs: errs };
      /* ⭐ §1〜§4 は純関数へ合成入力を直接食わせる (実プレイに頼らない = 並走に強い)。
         ⛔ 実プレイより**先**に採る — 実プレイは 90〜150 秒かかるので、
            そこで転んでも §1〜§4 の記録が残る。 */
      m.fmt = await measureFmt(browser, PORT, errs, {});
      m.play = await measurePlay(browser, PORT, errs, {});
      /* ⭐ (6a)(6b) の撤退アーム。⚠ 別ポート (RETREAT_PORT) から素の index.html を配り、
            ?rolltarget=0 を足して実プレイする。⛔ 「判定行 0 枚」だけでは自明に緑なので
            同じページで .rollPop と「注釈対象になりうる枚数」も同時に測る。 */
      if (needRetreat) {
        m.refErrs = [];
        m.ref = await measureRetreat(browser, RETREAT_PORT, m.refErrs, { query: RETREAT_QUERY });
        for (const e of m.refErrs) errs.push(e);
      }

      for (const sec of SECTIONS) {
        if (sec.keys.length === 0 && sec.pend.length === 0) continue;
        mark(sec.title);
        for (const key of sec.keys) {
          const a = ASSERT_OF[key];
          if (!a) { pending('(' + key + ') ⛔ SECTIONS に載っているが ASSERTS に無い', '配線漏れ'); continue; }
          const r = a[2](m);
          check('(' + a[0] + ') ' + a[1], r[0], r[1]);
        }
        for (const p of sec.pend) pending('(' + p[0] + ') ' + p[1], p[2]);
      }

      mark('[記録] 観測した吹き出し (⛔ 期待値ではない。読み解き用 / 項目 2 への材料)');
      const pops = popPops(m);
      console.log('       URL ' + (m.play ? m.play.url : '—')
        + '  起動 ' + (m.play && m.play.started ? 'OK' : '⛔ NG')
        + '  観測 ' + pops.length + ' 枚 / 注釈されるべき ' + popAnnotatable(m).length + ' 枚'
        + ' / 判定行つき ' + popWithVerdict(m).length + ' 枚');
      const shown = popAnnotatable(m).slice(0, 4);
      for (const r of (shown.length ? shown : pops.slice(0, 4))) {
        console.log('         [' + (r.cls || '') + '] '
          + JSON.stringify(String(r.text || '').replace(/\s+/g, ' ').slice(0, 78))
          + '  verdictLines=' + r.verdictLines + ' hasVerdict=' + r.hasVerdictClass);
        console.log('           html=' + JSON.stringify(String(r.html || '').slice(0, 150)));
      }
      console.log('       生成点 ' + (m.gen.ok
        ? JSON.stringify(m.gen.defs.map(d => d.name)) + '  (定義 ' + m.gen.nDef
          + ' / "rollPop " + type ' + m.gen.nCls + ' / html2 ' + m.gen.nNew
          + ' / 素の html ' + m.gen.nOld + ')'
        : '⛔ ' + m.gen.err));
      console.log('       クランプ規則: AC の下限 ' + FLOOR_AC
        + ' / DC の下限 ' + FLOOR_DC + ' / 上限 raw > ' + CAP_RAW);
      console.log('       撤退アーム ' + (m.ref
        ? ':' + RETREAT_PORT + RETREAT_QUERY + '  起動 ' + (m.ref.started ? 'OK' : '⛔ NG')
          + '  .rollPop ' + refPops(m).length + ' 枚 / 注釈対象 '
          + refPops(m).filter(isAnnotatable).length + ' 枚 / 判定行 ' + refWithVerdict(m).length + ' 枚'
        : '— (needRetreat=false)'));
      console.log('       合成入力 ' + FMT_ORDER.length + ' ケース (注釈対象 ' + FMT_ANNOT.length
        + ' / 対象外 ' + (FMT_ORDER.length - FMT_ANNOT.length) + ')  追記の実物 = '
        + JSON.stringify(m.fmt && m.fmt.a1 && typeof m.fmt.a1.out === 'string'
          ? m.fmt.a1.out.slice(FMT_CASES.a1.html.length) : null));

      mark('事故の記録 (判定は (4c) = 項目 2 の担当。⛔ ここで黙って捨てない)');
      console.log('       素のアームの pageerror / console.error: ' + errs.length + ' 件'
        + (errs.length ? '\n         ' + errs.slice(0, 6).join('\n         ') : ''));

    } else {
      // ══ 負のコントロール ═══════════════════════════════════════════════════
      if (MUT_SERVED.length) {
        mark('変異が素の配信に無く、変異ポートにだけ載っていること');
        for (const k of MUT_SERVED) {
          const f = '/' + MUT_SRC[k].file;
          const pure = await httpGet('http://localhost:' + PORT + f);
          const mut = await httpGet('http://localhost:' + PORT_OF[k] + f);
          if (typeof MUTATIONS[k].verifyServed === 'function') {
            const v = MUTATIONS[k].verifyServed(pure.body, mut.body);
            check('(n0a-' + k + ') 変換で配った欠陥が素に無く、変異側にだけ在る', v[0],
              f + '  ' + v[1] + (MUT_SRC[k].note ? '  [' + MUT_SRC[k].note + ']' : ''));
          } else {
            const eds = editsOf(MUTATIONS[k]);
            const bad = eds.filter(e =>
              !(pure.body.split(e.to).length - 1 === 0 && mut.body.split(e.to).length - 1 === 1));
            check('(n0a-' + k + ') 素には注入文字列が無く、変異側にちょうど 1 つある'
              + (eds.length > 1 ? ' (置換 ' + eds.length + ' 箇所すべて)' : ''),
              bad.length === 0,
              f + (bad.length ? '  ⛔ 当たっていない置換: '
                + bad.map(e => JSON.stringify(String(e.to).slice(0, 50))).join(' / ') : ''));
          }
          check('(n0b-' + k + ') 素と変異で配信バイト長が違う (同じ物を 2 回測っていない)',
            pure.body.length !== mut.body.length,
            '素=' + pure.body.length + 'B / 変異=' + mut.body.length + 'B');
        }

        mark('欠陥を注入すると担当の節が赤くなること');
        for (const k of MUT_IMPL) {
          const negErrs = [];
          const port = MUTATIONS[k].driver ? PORT : PORT_OF[k];
          const servedNeg = await httpGet('http://localhost:' + port + PAGE_PATH);
          const mm = { gen: genPointScan(servedNeg.body), servedBytes: servedNeg.body.length, errs: negErrs };
          mm.fmt = await measureFmt(browser, port, negErrs, {});
          /* ⭐ その変異が見る assert が実プレイを読むときだけ回す (1 走 ≒ 90 秒)。
             ⛔ 「読まないデータを採らない」だけで、母集団の扱いは 1 つも変えていない。 */
          const wants = MUTATIONS[k].targets.concat(MUTATIONS[k].record || []);
          const wantPlay = wants.some(t => PLAY_ASSERTS[t]);
          const wantRef = wants.some(t => REF_ASSERTS[t]);
          console.log('       [変異 ' + k + ' :' + port + '] 実プレイ '
            + (wantPlay ? 'あり' : 'なし (fmt のみ)') + ' / 撤退アーム ' + (wantRef ? 'あり' : 'なし'));
          if (wantPlay) mm.play = await measurePlay(browser, port, negErrs, {});
          if (wantRef) {
            mm.refErrs = [];
            mm.ref = await measureRetreat(browser, port, mm.refErrs, { query: RETREAT_QUERY });
          }
          for (const key of MUTATIONS[k].targets) {
            const a = ASSERT_OF[key];
            if (!a) {
              pending('(neg-' + k + '-' + key + ') 変異 ' + k + ' で (' + key + ') が赤くなる',
                '⛔ (' + key + ') はまだ ASSERTS に無い (後続項目が実装する)');
              continue;
            }
            const r = a[2](mm);
            check('(neg-' + k + '-' + key + ') 変異 ' + k + ' で (' + a[0] + ') が赤くなる — ' + a[1],
              r[0] === false, (r[0] ? '⛔ 緑のまま (空振り) ' : '') + r[1]);
          }
          for (const key of (MUTATIONS[k].record || [])) {
            const a = ASSERT_OF[key];
            if (!a) continue;
            const r = a[2](mm);
            console.log('       [記録・⛔ 判定しない] 変異 ' + k + ' でも ('
              + key + ') は ' + (r[0] ? '緑のまま' : '⛔ 赤になった') + '  — ' + r[1]);
          }
        }
      }

      if (MUT_TODO.length) {
        mark('まだ実装されていない変異 (⛔ 件数から隠さない)');
        for (const k of MUT_TODO) {
          pending('(neg-' + k + ') 変異 ' + k + ' → '
            + MUTATIONS[k].targets.map(t => '(' + t + ')').join('') + ' が赤くなる',
            MUTATIONS[k].why + '  [予定の配信先 ' + MUTATIONS[k].file
            + ' / 当て先の下見: ' + MUTATIONS[k].plan + ']');
        }
      } else {
        mark('変異の実装漏れ');
        check('(n9a) [装置] PENDING の変異が 0 件 (' + MUT_ORDER.length + ' 本すべて実装済)',
          true, MUT_ORDER.join(' / '));
      }
    }
  } catch (e) {
    check('(fatal) ドライバが例外なく完走する', false, e.message + '\n' + (e.stack || ''));
  } finally {
    await browser.close();
    for (const s of servers) s.close();
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
    console.log('  **PENDING** (最終項目の完了条件 = ここが 0 件):');
    for (const b of pend) console.log('    - ' + b.name + (b.detail ? '  — ' + b.detail : ''));
  }
  process.exit(failed.length ? 1 : 0);
})();
