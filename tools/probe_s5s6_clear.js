#!/usr/bin/env node
/*
 * probe_s5s6_clear.js — 実装依頼書 #75「敵の体質」§8 末尾「勝率の記録」の測定台
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⛔ **記録だけの道具**。本番 (index.html / tavern.html / audio.js / js/) は 1 バイトも変えない。
 *    起動時に `git diff HEAD --stat -- <本番4系統>` を引いて、空でなければ exit 2 で止まる。
 *
 * ■ 出自 = tools/probe_s2_clear.js のコピー (#75 §12-0 (10) の見立て)
 *   ⛔ probe_s2_clear.js 本体は母集団の腕 (素 + --negative) なので触らない。ここで直したのは:
 *   (a) 舞台の固定 SCEN / 期待値 S2_EXPECT を外し `--scen undead-temple,dragon-lair` で選ぶ
 *       (期待値は舞台ごとの独立表 SCEN_EXPECT。★は tavern.html の difficulty を数える)
 *   (b) index 側スイッチの表に enemytraits を**極性つき**で足した
 *       (既存 3 本 dndrange/mopup/s2fold は `=0` で const が true、enemytraits は `=0` で false)
 *   (c) 腕 = 「xp:<N>」と「qs:<k>=<v>」を `+` で組み合わせて 1 腕にできる
 *       (既定の腕は ON = `xp:<舞台の推奨 Lv>+qs:recruittalk=0` / OFF = 同 `+qs:enemytraits=0`)
 *       ⚠⚠ #54 以降、酒場で誰も誘っていなければ **ソロ** で出発する (tavern.html
 *         regeneratePartyMembers)。probe_s2_clear の既定腕もソロになっている。
 *         ここでは ?recruittalk=0 (従来の自動抽選 = 上限 RECRUIT_MAX 人) で 4 人編成に揃える。
 *         (スモーク 1 走行目: 竜の巣を Lv10 ソロで 63 秒で全滅 = 体質の場面に届かなかった)
 *   (d) 到達ノードの列 (通ったノードの並び・ボスノード RUN.bossNodeId へ着いたか)
 *   (e) 体質が「効いた回数」の列: 本番の updateInfo を着地直後にラップして
 *       IMMUNE (「<属性>は通用しない!」) / RESIST (「<属性>を和らげた」) /
 *       スリープの詠唱回数と「N体は眠らない」の N を数える。
 *       ⭐ ラップは道具の中で page.evaluate するだけ (本番に計測シームを置かない = changelog 不要)。
 *       ⚠ updateInfo は classic script 直下の関数宣言 = window のプロパティなので、
 *         window.updateInfo を差し替えると本番の裸の呼び出しにも効く。
 *         効いたかは推測しない: 差し替え後に `updateInfo === window.updateInfo` を読む (装置 assert 0g)。
 *
 * ■ 走らせ方 (交互の対・中断に強い)
 *   pair = 1..N、舞台ごとに ON と OFF を 1 走行ずつ。奇数ペアは ON が先、偶数ペアは OFF が先
 *   (時間帯・熱の偏りを両腕へ均す)。1 走行ごとに TSV へ 1 行追記し、再起動時は TSV に在る
 *   run_id (<scen>:p<pair>:<ON|OFF>) を SKIP する = 失うのは走行中の 1 本だけ。
 *   1 走行 = ブラウザを起動 → 酒場 → prepScenario → regeneratePartyMembers → departToScenario
 *   (本番の出発・人数も本番どおり) → index.html で決着まで 1 秒ポーリング → ブラウザを閉じる。
 *   ⭐ 走行ごとにブラウザを起動し直す (長い連走でタブのメモリが積もって後半だけ遅くなるのを避ける)。
 *
 * ■ 決着の分類 (probe_s2_clear と同じ 4 分類 + 打ち切り)
 *   clear / defeat / stall (診断の outcome:"aborted" か violations の stall|run-timeout) /
 *   timeout (= `--max` 秒で**打ち切り**。遅いだけの走行で、負けではない)。
 *
 * ■ 装置 assert
 *   0a 酒場の★と出発人数が舞台の期待値どおり / 0b 着地 URL と scenarioId
 *   0c 着地後の人数 (allies + 主人公) が酒場で決めた人数どおり (?recruittalk=0 の腕)
 *   0e 入場 Lv が XP 焼きどおり / 0f クエリ腕が index 側の const へ届いた (極性つき)
 *   0g updateInfo のラップが本番の裸の呼び出しに効いている
 *   0h OFF 腕では IMMUNE/RESIST/眠りの免疫が 0 回 (撤退が本当に全部等倍・全部眠る)
 *   1a 決着がちょうど 1 つ / 1b ページ側と診断側の 2 経路が一致
 *
 * ■ #76 (伝承判定) の追加 — 実装依頼書 2026-09-29_lore-check-ai.md §8 末尾「勝率の記録」
 *   (f) スイッチ表に lore (LORE_ON。極性は enemytraits と同じ = `=0` で false) を 1 本。
 *   (g) `--off-qs lore=0` で OFF 腕の差し替えを選べる (既定は enemytraits=0 = #75 と同じ腕)。
 *       OFF 腕 = 既定の ON 腕 + `qs:<--off-qs>`。舞台ごとの推奨 XP はそのまま舞台から出す。
 *   (h) 記録の列を**末尾に**足した (既存の列の並びは変えない): 編成 (主人公 + 仲間の職業) /
 *       伝承判定の回数と成功 (技能ごと。SkillCheck.resolveSkillCheck を opts.auto の
 *       history/religion/arcana だけ包んで数える) / ログの「📜」行の 3 種 (思い出した / 思い出せない /
 *       知る者はいない) / 終了時の __dfLore.known・tried / IMMUNE の敵名ごとの内訳。
 *       ⭐ 包みは道具の中の page.evaluate だけ (本番に計測シームを置かない = changelog 不要)。
 *   (i) 装置 assert 0i: lore=0 の腕では判定 0 回・📜 行 0・known 0 / 0j: 包みの回数 = 📜 の成否行の数。
 *   ⚠ TSV の arm 列は「その走行の腕のキー (ON|OFF)」。#75 の既定腕では従来どおり体質の ON/OFF と同じ値。
 *
 * 使い方:
 *   node tools/probe_s5s6_clear.js --scen undead-temple,dragon-lair --pairs 10 \
 *        --tsv <out.tsv> [--detail <dir>] [--max 1200] [--speed 15] [--port 10470] [--off-qs lore=0]
 *   node tools/probe_s5s6_clear.js --scen dragon-lair --pairs 1 --tsv t.tsv   # 設定の確かめ
 *   腕を自分で与える: --arm-on "xp:45000" --arm-off "xp:45000+qs:enemytraits=0"
 *   (腕の書式: base / xp:<累積XP> / qs:<key>=<値> を + で連結。key = recruit / recruittalk / dndrange /
 *    mopup / s2fold / enemytraits / lore)
 * exit 0=全走行が装置 assert を通過 / 1=崩れた走行あり / 2=環境不足・本番が dirty / 3=例外
 */
'use strict';
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return (i >= 0 && i + 1 < process.argv.length) ? process.argv[i + 1] : dflt;
}
const has = (n) => process.argv.includes('--' + n);

const SCENS    = String(arg('scen', 'undead-temple,dragon-lair')).split(',').map(s => s.trim()).filter(Boolean);
const PAIRS    = Math.max(1, parseInt(arg('pairs', '1'), 10));
const SPEED    = parseInt(arg('speed', '15'), 10);
const PORT     = parseInt(arg('port', '10470'), 10);
const MAXS     = parseInt(arg('max', '1200'), 10);
const HEADFUL  = has('headful');
const TSV      = arg('tsv', null);
const DETAIL   = arg('detail', null);

/* ── 舞台ごとの期待値 (ドライバが独立に持つ) ──────────────────────────────
 * stars = tavern.html の difficulty の★の数 / lv = 酒場の recommendedLevel。
 * ⭐ XP は D&D 3.5 の累積式「Lv N = (N-1)*N/2 * 1000」から出す (index の表を写経しない)。 */
const SCEN_EXPECT = {
  'undead-temple': { stars: 3, lv: 8,  label: 'シナリオ5 ★3 地下神殿 (リッチ)' },
  'dragon-lair':   { stars: 4, lv: 10, label: 'シナリオ6 ★4 竜の巣 (ファラクサス)' },
};
for (const s of SCENS) {
  if (!SCEN_EXPECT[s]) { console.error('[probe] 未知の舞台: ' + s + ' (使えるのは ' + Object.keys(SCEN_EXPECT).join(' / ') + ')'); process.exit(2); }
}
const xpForLevel = (lv) => (lv - 1) * lv / 2 * 1000;
function expectLevelFromXp(xp) {
  let lv = 1;
  for (let n = 2; n <= 10; n++) if (xp >= (n - 1) * n / 2 * 1000) lv = n;
  return lv;
}

/* ── 腕 ─────────────────────────────────────────────────────────────────────
 * ⭐ (b) 極性つき: want(v) = 「?k=v のとき const が取るべき値」。 */
const INDEX_SWITCHES = {
  dndrange:    { name: 'RANGE_LEGACY',    want: (v) => v === '0' },
  mopup:       { name: 'MOPUP_OFF',       want: (v) => v === '0' },
  s2fold:      { name: 'S2_FOLD_OFF',     want: (v) => v === '0' },
  enemytraits: { name: 'ENEMY_TRAITS_ON', want: (v) => v !== '0' },
  lore:        { name: 'LORE_ON',         want: (v) => v !== '0' },   /* #76 */
};
const OFF_QS = String(arg('off-qs', 'enemytraits=0'));
if (!/^[A-Za-z0-9_]+=[A-Za-z0-9_]+$/.test(OFF_QS)) { console.error('[probe] --off-qs の書式が不正: ' + OFF_QS); process.exit(2); }

function parseArm(spec) {
  const a = { spec, tavernQs: '', indexQs: [], xpSeed: null,
              expectRecruitOn: true, expectLevel: 1, expectSwitch: [], traitsOn: true };
  for (const part of String(spec).split('+').map(s => s.trim()).filter(Boolean)) {
    if (part === 'base') continue;
    let m = /^xp:(\d+)$/.exec(part);
    if (m) { a.xpSeed = parseInt(m[1], 10); a.expectLevel = expectLevelFromXp(a.xpSeed); continue; }
    m = /^qs:([A-Za-z0-9_]+)=([A-Za-z0-9_]+)$/.exec(part);
    if (m) {
      const k = m[1], v = m[2];
      if (k === 'recruit') { a.tavernQs += '&recruit=' + v; a.expectRecruitOn = (v !== '0'); continue; }
      if (k === 'recruittalk') { a.tavernQs += '&recruittalk=' + v; a.recruitTalkOff = (v === '0'); continue; }
      const sw = INDEX_SWITCHES[k];
      if (sw) {
        a.indexQs.push({ k, v });
        a.expectSwitch.push({ name: sw.name, want: sw.want(v) });
        if (k === 'enemytraits') a.traitsOn = sw.want(v);
        if (k === 'lore') a.loreOn = sw.want(v);
        continue;
      }
      console.error('[probe] 未知のクエリ腕: ' + part + '  (使えるのは recruit / ' + Object.keys(INDEX_SWITCHES).join(' / ') + ')');
      process.exit(2);
    }
    console.error('[probe] 腕の書式が不正: ' + part + '  (base / xp:<数> / qs:<key>=<値> を + で連結)');
    process.exit(2);
  }
  /* 体質の腕が明示されていないときも、0f で ON であることを確かめる */
  if (!a.expectSwitch.some(s => s.name === 'ENEMY_TRAITS_ON')) a.expectSwitch.push({ name: 'ENEMY_TRAITS_ON', want: true });
  /* #76: 伝承の腕も明示が無ければ ON であることを確かめる */
  if (a.loreOn === undefined) a.loreOn = true;
  if (!a.expectSwitch.some(s => s.name === 'LORE_ON')) a.expectSwitch.push({ name: 'LORE_ON', want: true });
  return a;
}

function armsFor(scen) {
  const xp = xpForLevel(SCEN_EXPECT[scen].lv);
  return {
    ON:  parseArm(arg('arm-on',  'xp:' + xp + '+qs:recruittalk=0')),
    OFF: parseArm(arg('arm-off', 'xp:' + xp + '+qs:recruittalk=0+qs:' + OFF_QS)),
  };
}

function productionDiff() {
  try {
    return execFileSync('git', ['diff', 'HEAD', '--stat', '--',
      'index.html', 'tavern.html', 'audio.js', 'js/'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch (e) { return 'GIT-ERROR: ' + ((e && e.message) || e); }
}
function headSha() {
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); }
  catch (e) { return '?'; }
}

function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  console.error('[probe] puppeteer-core が見つかりません'); process.exit(2);
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
  console.error('[probe] ブラウザが見つかりません'); process.exit(2);
}

const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

function startServer(port) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const fp = path.join(ROOT, u);
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

/* ── ページ側 ①: 起動前の仕込み (probe_s2_clear と同じ。indexQs は複数キー) ── */
function BOOT(cfg) {
  try {
    if (!sessionStorage.getItem('__dfProbePurged')) {
      [localStorage, sessionStorage].forEach(function (s) {
        Object.keys(s).forEach(function (k) {
          if (k.indexOf('dragonfighters.') === 0 || k.indexOf('df.') === 0) s.removeItem(k);
        });
      });
      localStorage.setItem('dragonfighters.prologueSeen', '1');
      if (cfg.xpSeed != null) localStorage.setItem('dragonfighters.xp', String(cfg.xpSeed));
      sessionStorage.setItem('__dfProbePurged', '1');
    }
  } catch (e) {}
  try {
    if (cfg.indexQs && cfg.indexQs.length && /index\.html$/.test(location.pathname)) {
      const sp = new URLSearchParams(location.search);
      let changed = false;
      cfg.indexQs.forEach(function (q) { if (sp.get(q.k) !== q.v) { sp.set(q.k, q.v); changed = true; } });
      if (changed) history.replaceState(null, '', location.pathname + '?' + sp.toString());
    }
  } catch (e) {}
}

/* ── ページ側 ②: 酒場で出発 (本番の関数だけを呼ぶ) ── */
const KICK = (sid) => {
  const out = { err: '' };
  try {
    out.recruitOn = (typeof isRecruitOn === 'function') ? isRecruitOn() : null;
    const sc = (typeof scenarios !== 'undefined') ? scenarios.find(s => s.id === sid) : null;
    if (!sc) { out.err = 'scenario not found: ' + sid; return out; }
    out.stars = (String(sc.difficulty || '').match(/★/g) || []).length;
    out.decided = (typeof recruitCountOf === 'function') ? recruitCountOf(sc) : null;
    out.max = (typeof RECRUIT_MAX === 'number') ? RECRUIT_MAX : null;
    prepScenario = sc;
    regeneratePartyMembers();
    out.tavernNpc = (selection.partyMembers || []).filter(m => m && !m.isHero).length;
    departToScenario();
    out.kicked = true;
  } catch (e) { out.err = String((e && e.message) || e); }
  return out;
};

/* ── ページ側 ③: 体質の効いた回数を数えるラップ (着地直後に 1 回) ──
 * ⚠ 本番の updateInfo をそのまま呼ぶ (表示は変えない)。数えるのは文言だけ:
 *   IMMUNE  = resolveElementDefense の「<炎|冷気|雷>は通用しない!」
 *   RESIST  = 同「<属性>を和らげた (ダメージ半減)」
 *   眠り    = allySleep の「範囲スリープ →」と「/ N体は眠らない (…)」 */
const WRAP = () => {
  const out = { installed: false, bare: false, err: '' };
  try {
    if (window.__probeTraitCount) { out.installed = true; out.bare = (updateInfo === window.updateInfo); return out; }
    const C = window.__probeTraitCount = { immune: 0, resist: 0, sleepCasts: 0, sleepImmune: 0,
      byEl: {}, names: {},
      /* #76 伝承: 包み = 技能ごとの {n: 振った回数, ok: 成功, dc: {DC: 回数}} / ログ = 📜 行の 3 種 */
      immuneNames: {}, lore: {}, loreLogOk: 0, loreLogFail: 0, loreNobody: 0, loreWrapped: false };
    const orig = window.updateInfo;
    if (typeof orig !== 'function') { out.err = 'updateInfo が window に無い'; return out; }
    /* #76: 伝承判定は runLoreCheck が SkillCheck.resolveSkillCheck(skill, dc, party, { auto: true }) で呼ぶ。
       ⚠ 他の判定 (隠密・罠・シナリオの選択肢) を数えないよう opts.auto かつ 3 技能だけ。 */
    try {
      const SC = window.SkillCheck;
      if (SC && typeof SC.resolveSkillCheck === 'function') {
        const origR = SC.resolveSkillCheck;
        const LS = { history: 1, religion: 1, arcana: 1 };
        SC.resolveSkillCheck = function (skill, dc, party, opts) {
          const p = origR.apply(this, arguments);
          if (LS[skill] && opts && opts.auto === true) {
            const L = C.lore[skill] || (C.lore[skill] = { n: 0, ok: 0, dc: {} });
            L.n++; L.dc[dc] = (L.dc[dc] || 0) + 1;
            Promise.resolve(p).then(function (r) { if (r && r.success) L.ok++; }, function () {});
          }
          return p;
        };
        C.loreWrapped = true;
      }
    } catch (e) {}
    window.updateInfo = function (msg) {
      try {
        const s = String(msg);
        if (/^📜 .*は伝承を思い出した — /.test(s)) C.loreLogOk++;
        else if (/^📜 .*は思い出せない… \(/.test(s)) C.loreLogFail++;
        else if (/^📜 この敵の正体を知る者はいない /.test(s)) C.loreNobody++;
        let m = /^(.*?): (炎|冷気|雷)は通用しない!/.exec(s);
        if (m) { C.immune++; C.byEl['IMMUNE:' + m[2]] = (C.byEl['IMMUNE:' + m[2]] || 0) + 1; C.names[m[1]] = (C.names[m[1]] || 0) + 1;
                 C.immuneNames[m[1] + ':' + m[2]] = (C.immuneNames[m[1] + ':' + m[2]] || 0) + 1; }
        m = /^(.*?): (炎|冷気|雷)を和らげた \(ダメージ半減\)/.exec(s);
        if (m) { C.resist++; C.byEl['RESIST:' + m[2]] = (C.byEl['RESIST:' + m[2]] || 0) + 1; C.names[m[1]] = (C.names[m[1]] || 0) + 1; }
        if (/: 範囲スリープ → /.test(s)) {
          C.sleepCasts++;
          const k = / \/ (\d+)体は眠らない \(/.exec(s);
          if (k) C.sleepImmune += parseInt(k[1], 10);
        }
      } catch (e) {}
      return orig.apply(this, arguments);
    };
    out.installed = true;
    out.bare = (updateInfo === window.updateInfo);
  } catch (e) { out.err = String((e && e.message) || e); }
  return out;
};

/* ── ページ側 ④: index の観測 (1 秒ごと)。裸の識別子で読む ── */
const TICK = () => {
  const g = (f, d) => { try { const v = f(); return v === undefined ? d : v; } catch (e) { return d; } };
  return {
    scen:    g(() => scenarioId, null),
    node:    g(() => currentNodeId, null),
    bossNode: g(() => (RUN ? RUN.bossNodeId : null), null),
    over:    g(() => !!gameOver, false),
    cleared: g(() => !!dungeonCleared, false),
    headHp:  g(() => (typeof hp === 'number' ? hp : null), null),
    headMax: g(() => (typeof maxHp === 'number' ? maxHp : null), null),
    allies:  g(() => allies.map(a => ({ alive: !!a.alive, isHero: !!a.isHero,
               level: (a.level == null ? null : a.level) })), []),
    heroAlive: g(() => isHeroAlive(), null),
    heroLevel: g(() => getLevelFromXP(currentTotalXp || 0), null),
    xp:      g(() => earnedXpThisRun, null),
    enemyTotal: g(() => enemies.length, -1),
    enemyLeft:  g(() => enemies.filter(e => e.alive && !e.passiveNpc).length, -1),
    bossTotal:  g(() => enemies.filter(e => e.def && e.def.isBoss).length, -1),
    bossAlive:  g(() => enemies.filter(e => e.def && e.def.isBoss && e.alive).length, -1),
    bossNames:  g(() => enemies.filter(e => e.def && e.def.isBoss).map(e => e.type || e.def.name), []),
    sw: {
      RANGE_LEGACY:    g(() => RANGE_LEGACY, null),
      MOPUP_OFF:       g(() => MOPUP_OFF, null),
      S2_FOLD_OFF:     g(() => S2_FOLD_OFF, null),
      ENEMY_TRAITS_ON: g(() => ENEMY_TRAITS_ON, null),
      winTraitsOn:     g(() => window.__dfEnemyTraits.on, null),
      LORE_ON:         g(() => LORE_ON, null),
      winLoreOn:       g(() => window.__dfLore.on, null),
    },
    /* #76: 編成 (主人公の職業 + 仲間の職業) と伝承の知識 */
    heroClass: g(() => leaderClassKey, null),
    allyClasses: g(() => allies.map(a => a.classKey || '?'), []),
    loreKnown: g(() => Array.from(window.__dfLore.known).sort(), null),
    loreTried: g(() => Array.from(window.__dfLore.tried).sort(), null),
    cnt: g(() => JSON.parse(JSON.stringify(window.__probeTraitCount)), null),
    search: g(() => location.search, ''),
  };
};

const READ_REPORT = () => {
  try {
    const r = JSON.parse(localStorage.getItem('dragonfighters.debugReport') || 'null');
    if (!r) return null;
    return {
      hasCurrent: !!r.current,
      curViol: r.current ? Object.keys(r.current.violations || {}) : [],
      runs: (r.runs || []).map(x => ({
        outcome: x.outcome || null, scen: x.scenarioId || null,
        partyAlive: (typeof x.partyAlive === 'number' ? x.partyAlive : null),
        viol: Object.keys(x.violations || {}),
      })),
    };
  } catch (e) { return null; }
};

function classify(last, reportRun, report) {
  const viol = (reportRun ? reportRun.viol : (report ? report.curViol : [])) || [];
  if (reportRun && reportRun.outcome === 'aborted') return 'stall';
  if (last.cleared) return 'clear';
  if (last.over) return 'defeat';
  if (viol.indexOf('stall') >= 0 || viol.indexOf('run-timeout') >= 0) return 'stall';
  return 'timeout';
}

/* ── 1 走行 ── */
async function runOnce(puppeteer, browserPath, makeProfile, scen, arm, runId, armKey) {
  const ex = SCEN_EXPECT[scen];
  const rec = { runId, scen, arm: arm.spec, armKey: armKey || (arm.traitsOn ? 'ON' : 'OFF'),
                traitsArm: arm.traitsOn ? 'ON' : 'OFF', loreArm: arm.loreOn ? 'ON' : 'OFF',
                ok: false, asserts: {}, outcome: null, pageerrors: [], err: '', elapsedS: 0,
                startedAt: new Date().toISOString() };
  const profile = makeProfile('df_probe_s5s6_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           '--disable-extensions', '--mute-audio', '--autoplay-policy=no-user-gesture-required',
           '--user-data-dir=' + profile] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    page.on('pageerror', e => { if (rec.pageerrors.length < 5) rec.pageerrors.push(e.message); });
    await page.evaluateOnNewDocument(BOOT, { xpSeed: arm.xpSeed, indexQs: arm.indexQs });

    const tavUrl = 'http://localhost:' + PORT + '/tavern.html?autoplay=' + SPEED + arm.tavernQs;
    const waitTavern = "typeof scenarios !== 'undefined' && typeof departToScenario === 'function'"
      + " && typeof regeneratePartyMembers === 'function' && typeof selection !== 'undefined'"
      + " && selection && Array.isArray(selection.partyComposition)";
    const waitIndex = "typeof mapData !== 'undefined' && typeof heroAI === 'function'";

    await page.goto(tavUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(waitTavern, { timeout: 30000 });
    const kick = await page.evaluate(KICK, scen);
    rec.tavern = kick;
    if (kick.err) { rec.err = '酒場: ' + kick.err; return rec; }

    rec.asserts['0a_tavern'] = {
      got: { recruitOn: kick.recruitOn, decided: kick.decided, stars: kick.stars, max: kick.max, tavernNpc: kick.tavernNpc },
      want: { recruitOn: arm.expectRecruitOn, stars: ex.stars, decided: 'max' },
      ok: kick.recruitOn === arm.expectRecruitOn && kick.stars === ex.stars
          && typeof kick.max === 'number' && kick.max > 0
          && (!arm.expectRecruitOn || kick.decided === kick.max)
          /* ⭐ #54 以降、酒場で誰も誘っていないと**ソロ**で出発する (regeneratePartyMembers)。
             既定の腕は ?recruittalk=0 (従来の自動抽選) で 4 人に揃える。人数が上限どおりかを見る */
          && (!arm.recruitTalkOff || kick.tavernNpc === kick.decided) };

    let landed = null;
    try { await page.waitForFunction(waitIndex, { timeout: 60000 }); landed = page.url(); }
    catch (e) { landed = 'TIMEOUT url=' + page.url(); rec.err = '着地せず: ' + landed; }
    rec.landed = landed;

    const wrap = await page.evaluate(WRAP);
    rec.asserts['0g_wrapBare'] = { got: wrap, want: { installed: true, bare: true },
      ok: wrap.installed === true && wrap.bare === true };

    const rp0 = await page.evaluate(READ_REPORT);
    const reportBase = rp0 ? rp0.runs.length : 0;
    const t0 = await page.evaluate(TICK);
    rec.entry = { level: t0.heroLevel, headMax: t0.headMax, party: t0.allies.length + 1,
                  allyLvls: t0.allies.map(a => a.level), search: t0.search, sw: t0.sw,
                  enemyTotal: t0.enemyTotal, bossNode: t0.bossNode, node: t0.node,
                  heroClass: t0.heroClass, allyClasses: t0.allyClasses };

    rec.asserts['0b_landed'] = { got: { url: landed, scen: t0.scen }, want: scen,
      ok: /\/index\.html/.test(String(landed)) && t0.scen === scen };
    rec.asserts['0e_entryLevel'] = { got: t0.heroLevel, want: arm.expectLevel, ok: t0.heroLevel === arm.expectLevel };
    if (arm.recruitTalkOff) {
      /* ⭐ 着地した index 側の人数 (本番の allies + 主人公) が酒場で決めた人数と一致するか */
      rec.asserts['0c_entryParty'] = { got: t0.allies.length + 1, want: 1 + kick.decided,
        ok: t0.allies.length + 1 === 1 + kick.decided };
    }
    const swBad = arm.expectSwitch.filter(s => t0.sw[s.name] !== s.want);
    rec.asserts['0f_indexSwitch'] = {
      got: arm.expectSwitch.map(s => s.name + '=' + t0.sw[s.name]).concat(['win.on=' + t0.sw.winTraitsOn,
           'winLore.on=' + t0.sw.winLoreOn]),
      want: arm.expectSwitch.map(s => s.name + '=' + s.want),
      ok: swBad.length === 0 && t0.sw.winTraitsOn === arm.traitsOn && t0.sw.winLoreOn === arm.loreOn };
    if (!rec.asserts['0b_landed'].ok) return rec;

    /* ── 決着まで観測 ── */
    const nodes = [];
    const pushNode = (n) => { if (n != null && nodes[nodes.length - 1] !== n) nodes.push(n); };
    pushNode(t0.node);
    let bossNodeReached = (t0.node != null && t0.node === t0.bossNode);
    let bossSeenAlive = false, heroDownAtS = null;
    let last = t0, reportRaw = null;
    const tStart = Date.now();
    while ((Date.now() - tStart) / 1000 < MAXS) {
      await sleep(1000);
      const t = await page.evaluate(TICK);
      pushNode(t.node);
      if (t.node != null && t.node === t.bossNode) bossNodeReached = true;
      if (t.bossTotal > 0 && t.bossAlive > 0) bossSeenAlive = true;
      if (heroDownAtS == null && t.heroAlive === false) heroDownAtS = Math.round((Date.now() - tStart) / 1000);
      last = t;
      if (t.over || t.cleared) break;
      const rp = await page.evaluate(READ_REPORT);
      if (rp && rp.runs.length > reportBase) { reportRaw = rp; break; }
    }
    rec.elapsedS = Math.round((Date.now() - tStart) / 1000);
    for (let i = 0; i < 16; i++) {
      const rp = await page.evaluate(READ_REPORT);
      reportRaw = rp;
      if (rp && rp.runs.length > reportBase) break;
      await sleep(500);
    }
    /* 決着後の最終カウント (最後の 1 秒ぶんを取りこぼさない) */
    const tEnd = await page.evaluate(TICK);
    const reportRun = (reportRaw && reportRaw.runs.length > reportBase) ? reportRaw.runs[reportRaw.runs.length - 1] : null;
    rec.outcome = classify(last, reportRun, reportRaw);
    const cnt = tEnd.cnt || last.cnt || { immune: null, resist: null, sleepCasts: null, sleepImmune: null, byEl: {}, names: {} };
    rec.leg = {
      nodes, bossNode: t0.bossNode, bossNodeReached, bossSeenAlive, heroDownAtS,
      end: { cleared: last.cleared, over: last.over, node: last.node, xp: last.xp,
             alliesAlive: last.allies.filter(a => a.alive).length, alliesTotal: last.allies.length,
             heroAlive: last.heroAlive, enemyLeft: last.enemyLeft, enemyTotal: last.enemyTotal,
             bossAlive: last.bossAlive, bossTotal: last.bossTotal, bossNames: last.bossNames },
      cnt, report: reportRun,
      loreKnown: tEnd.loreKnown || last.loreKnown, loreTried: tEnd.loreTried || last.loreTried,
    };
    /* #76 伝承の装置 assert */
    const loreN = Object.keys(cnt.lore || {}).reduce((s, k) => s + cnt.lore[k].n, 0);
    const loreOk = Object.keys(cnt.lore || {}).reduce((s, k) => s + cnt.lore[k].ok, 0);
    rec.asserts['0j_loreWrapXlog'] = {
      got: { wrapped: cnt.loreWrapped, n: loreN, ok: loreOk, logOk: cnt.loreLogOk, logFail: cnt.loreLogFail },
      want: 'wrapped && n = logOk + logFail && ok = logOk',
      ok: cnt.loreWrapped === true && loreN === (cnt.loreLogOk + cnt.loreLogFail) && loreOk === cnt.loreLogOk };
    if (!arm.loreOn) {
      const kn = rec.leg.loreKnown;
      rec.asserts['0i_loreOffIsZero'] = {
        got: { n: loreN, logOk: cnt.loreLogOk, logFail: cnt.loreLogFail, nobody: cnt.loreNobody, known: kn ? kn.length : null },
        want: 0,
        ok: loreN === 0 && cnt.loreLogOk === 0 && cnt.loreLogFail === 0 && cnt.loreNobody === 0 && Array.isArray(kn) && kn.length === 0 };
    }

    rec.asserts['1a_outcomeOne'] = { got: rec.outcome, want: 'clear|defeat|stall|timeout',
      ok: ['clear', 'defeat', 'stall', 'timeout'].indexOf(rec.outcome) >= 0 && !(last.cleared && last.over) };
    const pageSide = last.cleared ? 'clear' : (last.over ? 'defeat' : 'running');
    const repSide = reportRun ? reportRun.outcome : null;
    const AGREE = { clear: 'clear', defeat: 'defeat', aborted: 'running', budget: 'running' };
    rec.asserts['1b_outcomeXcheck'] = { got: { page: pageSide, report: repSide },
      ok: repSide ? (AGREE[repSide] === pageSide) : (rec.outcome === 'timeout') };
    if (!arm.traitsOn) {
      rec.asserts['0h_offIsZero'] = { got: { immune: cnt.immune, resist: cnt.resist, sleepImmune: cnt.sleepImmune },
        want: 0, ok: cnt.immune === 0 && cnt.resist === 0 && cnt.sleepImmune === 0 };
    }
    rec.ok = Object.keys(rec.asserts).every(k => rec.asserts[k].ok);
  } catch (e) {
    rec.err = String((e && e.message) || e);
  } finally {
    try { await browser.close(); } catch (e) {}
  }
  return rec;
}

/* ── TSV ── */
const COLS = ['run_id', 'scen', 'pair', 'arm', 'order', 'started_at', 'head', 'outcome', 'ok', 'bad_asserts',
  'entry_lv', 'party', 'elapsed_s', 'nodes_n', 'nodes', 'final_node', 'boss_node', 'boss_node_reached',
  'boss_total', 'boss_alive_end', 'enemy_left', 'enemy_total', 'allies_alive_end', 'hero_alive_end',
  'hero_down_at_s', 'xp', 'immune', 'resist', 'sleep_casts', 'sleep_immune', 'by_element', 'err',
  /* #76 (末尾に追加。既存列の並びは不変) */
  'traits_arm', 'lore_arm', 'hero_class', 'ally_classes', 'lore_n', 'lore_ok', 'lore_by_skill',
  'lore_log_ok', 'lore_log_fail', 'lore_nobody', 'lore_known', 'lore_tried', 'immune_by_name'];
function tsvRow(r, pair, order, head) {
  const L = r.leg || {}, E = L.end || {}, C = L.cnt || {};
  const bad = Object.keys(r.asserts).filter(k => !r.asserts[k].ok).join(',');
  const LO = C.lore || {};
  const v = {
    run_id: r.runId, scen: r.scen, pair, arm: r.armKey, order, started_at: r.startedAt, head,
    outcome: r.outcome || 'ERR', ok: r.ok ? 1 : 0, bad_asserts: bad,
    entry_lv: r.entry ? r.entry.level : '', party: r.entry ? r.entry.party : '', elapsed_s: r.elapsedS,
    nodes_n: L.nodes ? L.nodes.length : '', nodes: L.nodes ? L.nodes.join('>') : '',
    final_node: E.node == null ? '' : E.node, boss_node: L.bossNode == null ? '' : L.bossNode,
    boss_node_reached: L.bossNodeReached ? 1 : 0,
    boss_total: E.bossTotal, boss_alive_end: E.bossAlive, enemy_left: E.enemyLeft, enemy_total: E.enemyTotal,
    allies_alive_end: E.alliesAlive, hero_alive_end: E.heroAlive === true ? 1 : (E.heroAlive === false ? 0 : ''),
    hero_down_at_s: L.heroDownAtS == null ? '' : L.heroDownAtS, xp: E.xp == null ? '' : E.xp,
    immune: C.immune, resist: C.resist, sleep_casts: C.sleepCasts, sleep_immune: C.sleepImmune,
    by_element: C.byEl ? Object.keys(C.byEl).sort().map(k => k + '=' + C.byEl[k]).join(';') : '',
    err: (r.err || '') + (r.pageerrors.length ? ' pageerror:' + r.pageerrors[0] : ''),
    traits_arm: r.traitsArm, lore_arm: r.loreArm,
    hero_class: r.entry ? r.entry.heroClass : '',
    ally_classes: r.entry && r.entry.allyClasses ? r.entry.allyClasses.join(',') : '',
    lore_n: Object.keys(LO).reduce((s, k) => s + LO[k].n, 0),
    lore_ok: Object.keys(LO).reduce((s, k) => s + LO[k].ok, 0),
    lore_by_skill: Object.keys(LO).sort().map(k => k + '=' + LO[k].ok + '/' + LO[k].n
      + '(DC' + Object.keys(LO[k].dc).sort().map(d => d + 'x' + LO[k].dc[d]).join(',') + ')').join(';'),
    lore_log_ok: C.loreLogOk, lore_log_fail: C.loreLogFail, lore_nobody: C.loreNobody,
    lore_known: L.loreKnown ? L.loreKnown.join(',') : '', lore_tried: L.loreTried ? L.loreTried.join(',') : '',
    immune_by_name: C.immuneNames ? Object.keys(C.immuneNames).sort().map(k => k + '=' + C.immuneNames[k]).join(';') : '',
  };
  return COLS.map(c => String(v[c] == null ? '' : v[c]).replace(/[\t\r\n]+/g, ' ')).join('\t');
}
function doneIds(file) {
  if (!file || !fs.existsSync(file)) return new Set();
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  return new Set(lines.slice(1).map(l => l.split('\t')[0]));
}

/* ── 本体 ── */
(async () => {
  const diff = productionDiff();
  console.log('[probe] 本番の差分 (git diff HEAD -- index.html tavern.html audio.js js/): ' + (diff ? '\n' + diff : '空 ✓'));
  if (diff) { console.error('[probe] ⛔ 本番に差分があります。記録の前後で別ビルドが混ざるので止めます。'); process.exit(2); }
  const head = headSha();

  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const makeProfile = require('./_pptr_profile');

  if (TSV && !fs.existsSync(TSV)) fs.writeFileSync(TSV, COLS.join('\t') + '\n', 'utf8');
  if (DETAIL) fs.mkdirSync(DETAIL, { recursive: true });
  const done = doneIds(TSV);
  if (done.size) console.log('[probe] RESUME: ' + done.size + ' 走行は TSV に済み → SKIP');

  let srv;
  try { srv = await startServer(PORT); }
  catch (e) { console.error('[probe] ポート ' + PORT + ' を開けません: ' + e.message); process.exit(2); }

  console.log('[probe] HEAD=' + head + '  舞台=' + SCENS.join(',') + '  pairs=' + PAIRS + '  OFF腕=+qs:' + OFF_QS
    + '  autoplay=' + SPEED + '  1走行上限=' + MAXS + '秒  port=' + PORT);
  const all = [];
  for (let p = 1; p <= PAIRS; p++) {
    for (const scen of SCENS) {
      const arms = armsFor(scen);
      const order = (p % 2 === 1) ? ['ON', 'OFF'] : ['OFF', 'ON'];
      for (let oi = 0; oi < order.length; oi++) {
        const key = order[oi];
        const runId = scen + ':p' + p + ':' + key;
        if (done.has(runId)) { console.log('  SKIP ' + runId); continue; }
        const r = await runOnce(puppeteer, browserPath, makeProfile, scen, arms[key], runId, key);
        all.push(r);
        const L = r.leg || {}, C = L.cnt || {}, E = L.end || {};
        console.log('  ' + (r.ok ? '✓' : '⛔') + ' ' + runId + ' → ' + (r.outcome || 'ERR')
          + ' Lv' + (r.entry ? r.entry.level : '?') + ' ' + (r.entry ? r.entry.party : '?') + '人'
          + ' ノード=' + (L.nodes ? L.nodes.join('>') : '?') + (L.bossNodeReached ? ' [ボス部屋]' : '')
          + ' ボス=' + (E.bossTotal ? (E.bossAlive ? '生存' : '撃破') : '—')
          + ' IMMUNE=' + C.immune + ' RESIST=' + C.resist + ' 眠り' + C.sleepCasts + '回/免疫' + C.sleepImmune
          + ' 伝承' + Object.keys(C.lore || {}).map(k => k + C.lore[k].ok + '/' + C.lore[k].n).join(',')
          + ' 編成=' + (r.entry ? r.entry.heroClass + '+' + (r.entry.allyClasses || []).join(',') : '?')
          + ' (' + r.elapsedS + '秒)'
          + (r.ok ? '' : '  崩れ=' + Object.keys(r.asserts).filter(k => !r.asserts[k].ok).map(k => k + JSON.stringify(r.asserts[k].got)).join(' '))
          + (r.err ? '  err=' + r.err : ''));
        if (TSV) fs.appendFileSync(TSV, tsvRow(r, p, oi + 1, head) + '\n', 'utf8');
        if (DETAIL) {
          try { fs.writeFileSync(path.join(DETAIL, runId.replace(/[^A-Za-z0-9_-]+/g, '_') + '.json'), JSON.stringify(r, null, 1), 'utf8'); } catch (e) {}
        }
      }
    }
  }
  srv.close();
  const broken = all.filter(r => !r.ok);
  console.log('\n[probe] 今回 ' + all.length + ' 走行 / 装置 assert 崩れ ' + broken.length + ' 件');
  process.exit(broken.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(3); });
