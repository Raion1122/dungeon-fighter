#!/usr/bin/env node
/*
 * verify_scroll_shelf.js — 実装依頼書 #77「武器防具屋に巻物の棚」の受入ドライバ
 *                          (依頼書 2026-09-30_scroll-shelf.md §8)
 * ════════════════════════════════════════════════════════════════════════════════
 *   node tools/verify_scroll_shelf.js                          # 素
 *   node tools/verify_scroll_shelf.js --negative               # 変異 8 本 (port 10485〜10492)。先に素の基準を走らせる
 *   node tools/verify_scroll_shelf.js --negative --only rawstock,noany
 *   node tools/verify_scroll_shelf.js --mutate rawstock        # 変異 1 本を載せて手回し (担当表を実走で決める用)
 * exit 0=期待どおり / 1=FAIL あり・変異の空振り・担当が絞れていない・注入行が実行されていない
 *      2=環境不足 (puppeteer / Chrome / git が無い)・例外
 *      3=装置の腐敗 (変異の注入点がちょうど 1 箇所でない・行数が変わる / ソースの正規表現が 0 件 / 定数が見つからない)
 *
 * ■ 方針 — tavern.html を puppeteer で開き、localStorage を仕込んでから読み込み直し、
 *   ① 検証ブリッジ window.__equipTV (scrollShelf / shopBuyScroll / scrollStock / learnScroll ほか) と
 *   ② #shopList の DOM (「巻物」の見出し・行の名前・右端のボタン / 札) を**両方**見る。
 *   - 期待値の出所 = **このドライバが tavern.html のソースから正規表現で引いた SCROLL_CATALOG_TV**
 *     (DRV_CAT)。⛔ ページの表から期待値を作らない (片方の写経にしない)。ページの表とは (0a) で突き合わせる。
 *   - 値段は 80 を焼かない。ソースの `const SCROLL_SHELF_PRICE = <n>;` を読んで比べる (依頼書 §8「測らないこと」)。
 *   - 棚の追加前後の恒等 (4a)(4b) = 同じ配信の ?scrollshop=0 (棚なし) と、HEAD~1 の本番
 *     (`git show 54bb89a:tavern.html` = 棚を足す直前) を /tavern.__base77.html として同じオリジンで配り、3 つを比べる。
 *   - 撤退の腕 = tavern.html?scrollshop=0 を直接開く (ページ単位の判定 isScrollShopOnTV)。
 *
 * ■ 測っているもの (依頼書 §8 の番号)
 *   §0 (0a) [装置] ソースから引いた巻物が common 4 件 + それ以外 13 件以上 (#78 §6 で全件数の固定をやめた・0 件なら exit 3) + ページの表 (SCROLL_CATALOG_TV) と
 *           id / name / spellId / classKey / rarity が全件一致
 *      (0b) [装置] __equipTV.scrollShelf / shopBuyScroll / scrollStock / learnScroll が関数・#shopList に .shopGroupHead が 1 つ以上
 *           ⭐ これが無いと全 assert が空振りで永久緑
 *      (0c) [装置] 全ページが起動し (__equipTV が立つ) pageerror 0 件 (⭐ 構文破壊で全部赤くなる偽の検出を見分ける)
 *   §1 (1a) 新しいセーブで「巻物」の見出しが 1 つ・その下の行の名前 = ソースの common 4 件 (順も)・ブリッジの id 列も同じ
 *      (1b) uncommon / rare の巻物 (13 件以上) の名前が #shopList に 1 件も無い・ブリッジも common だけ
 *      (1c) 主人公を戦士・僧侶・魔法使い・エルフに変えても 4 件は同じ (shopHeroKey() が実際に変わったことも確かめる)
 *      (1d) 売却タブに「巻物」の見出しも巻物の名前も無い (shopTab === "sell" を確かめる)
 *      (1e) 武器防具を全部所持させても購入タブに「買える品はもうありません。」が出ない・見出しは「巻物」だけ (罠C)
 *   §2 (2a) 新しいセーブでスリープの行は「習得済み」でボタンが無い・state known・shopBuyScroll = {ok:false, reason:"known"} (200G 持たせて)
 *      (2b) 他の common 3 件は state buyable・行に「購入 <SCROLL_SHELF_PRICE>G」のボタン
 *      (2c) tavern.html?magesleep=0 ではスリープが buyable・行にボタン (isSpellKnownTV("mage","sleep") が偽になったことも確かめる)
 *      (2d) バーニングハンズを 1 冊持たせると「所持中」・stocked・買っても金貨/所持数が変わらない / learnScroll の後は「習得済み」・known
 *   §3 (3a) 200G でバーニングハンズを買う → ok:true・price = SCROLL_SHELF_PRICE・金貨 200-P・scrollStock()=1・localStorage も 1
 *           + DOM のボタンを押してヘイルオブソーンを買う → 金貨 200-2P・scrollStock()=1・localStorage も 1・行が「所持中」
 *      (3b) 金貨 P-1 ではボタンが disabled (P ちょうどでは押せる)・shopBuyScroll = gold・金貨も所持品も localStorage も変わらない
 *      (3c) 罠A: ブレスの聖典を買う → 持たせておいたバーニングハンズを learnScroll で読む → 聖典がまだ 1 冊 (scrollStock と localStorage)
 *      (3d) (3a) の後に読み込み直し、既定パネル #scrollLibraryList へ renderScrollLibrary() を描かせると買った 2 冊の名前が出る
 *   §4 (4a) 武器防具の shopBuy / shopSell の戻り値と金貨の増減が、素 = ?scrollshop=0 = HEAD~1 (54bb89a) で全品一致 (戦士・魔法使い)
 *      (4b) DF_PRICE_BY_RARITY 〜 dfShopSellPrice のソースが HEAD~1 と同一 + buyPrice / sellPrice / dfShopBuyPrice / dfShopSellPrice の
 *           値が全職・全品で HEAD~1 のページ (と ?scrollshop=0) と一致
 *   §5 (5a) ?scrollshop=0 → 「巻物」の見出しが無い (店は描かれている)・scrollShelf() が空・shopBuyScroll = noitem・金貨/所持品不変 (罠D)
 *   ⛔ 測らないこと (依頼書 §8): 見出しや行の見た目の寸法・色 / トーストの文面と表示時間 / 値段 80G の妥当性
 *
 * ■ ⚠ 計測機構
 *   - 配信は内蔵 http サーバ。tavern.html は**起動時に 1 回だけ readFileSync して凍結**し、変異はその文字列をメモリ上で差し替える
 *     (⛔ 本番ファイルは 1 バイトも触らない)。他のファイルは都度ディスクから配る。
 *   - 起動時に全変異のアンカーを**原本**で検算する (各ちょうど 1 件・注入文字列が原本に無い・行数不変)。崩れたら素でも exit 3。
 *   - 変異の注入行は console.log("__MUTHIT__<key>") を同じ行に持つ。--negative / --mutate では**注入行が実行されたこと**を
 *     その印の件数で確かめる (0 件 = 測っている場所に現れていない = 空振り扱いで exit 1)。
 *   - tavern.html は CRLF。2 行にまたがるアンカーは原本の改行で連結する。
 *   - ⛔ このドライバを timeout コマンドで包まない。⛔ 8765 (ユーザーの試遊サーバ) に触らない。
 *
 * ■ ポート = **10484** (素) / 変異 **10485〜10492** (8 本・MUTATIONS の並び順)。
 * ■ 所要 (2026-09-30 この機械の実測・HEAD d9b18d9) = 素 3.0 秒 (19 assert・3 回とも同じ) / --negative 23.4 秒 (素の基準 + 変異 8 本・8/8)。
 *   ページの読み込み 19 回 (1 枚のタブを使い回す)。§4 だけ /tavern.__base77.html (git show 54bb89a) を開く。
 * ■ 担当表の依頼書 §8 との差 (実走で決めた。予想は全部含む): rawknown +(3b) / allrarity +(1c)(1e)(3b) / idlist +(1c)(1e)(2a) /
 *   nostockcap +(3a) / herofilter +(1a)(2a)(2b)(2c)(2d)(3a)(3b)(3c)(3d) / rawstock = (3a)(3c) の両方。
 */
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');   // ⚠ path.resolve 必須
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : d; };
const flag = (n) => argv.indexOf('--' + n) >= 0;
const HEADFUL = flag('headful');
const NEGATIVE = flag('negative');
const PORT = parseInt(arg('port', '10484'), 10);
const MUTATE = arg('mutate', null);
const ONLY = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const T_START = Date.now();
const J = (x) => JSON.stringify(x);

/* ══════════════════════════════════════════════════════════════════════════════
 * 配信スナップショット (起動時に 1 回だけ読んで凍結)
 * ══════════════════════════════════════════════════════════════════════════════ */
const F_TAVERN = 'tavern.html';
const F_BASE = 'tavern.__base77.html';   // HEAD~1 の本番を同じディレクトリ (= 同じオリジン・同じ相対パス) で配る
const BASE_COMMIT = '54bb89a';           // #77 項目1 = 棚を足す直前 (本番は f50412d と同一)
const PRISTINE = fs.readFileSync(path.join(ROOT, F_TAVERN), 'utf8');
const EOL = PRISTINE.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
let BASE_SRC;
try {
  BASE_SRC = execFileSync('git', ['show', BASE_COMMIT + ':' + F_TAVERN], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
} catch (e) {
  console.error('[vet] ⛔ git show ' + BASE_COMMIT + ':' + F_TAVERN + ' が読めない (環境): ' + String((e && e.message) || e).slice(0, 200));
  process.exit(2);
}

/* ══════════════════════════════════════════════════════════════════════════════
 * ② ドライバが独立に引く表 (ソースの正規表現。⛔ ページの表から作らない)
 * ══════════════════════════════════════════════════════════════════════════════ */
function parseCatalog(src) {
  const m = src.match(/const SCROLL_CATALOG_TV = \{([\s\S]*?)\r?\n\s*\};/);
  if (!m) return [];
  const out = [];
  const re = /"([a-z0-9-]+)":\s*\{\s*name:\s*"([^"]+)",\s*spellId:\s*"([^"]+)",\s*classKey:\s*"([a-z]+)",\s*rarity:\s*"([a-z]+)"\s*\}/g;
  let r;
  while ((r = re.exec(m[1]))) out.push({ id: r[1], name: r[2], spellId: r[3], classKey: r[4], rarity: r[5] });
  return out;
}
const DRV_CAT = parseCatalog(PRISTINE);
const DRV_COMMON = DRV_CAT.filter((c) => c.rarity === 'common');
const DRV_OTHER = DRV_CAT.filter((c) => c.rarity !== 'common');
if (!DRV_CAT.length || !DRV_COMMON.length) {
  console.error('[vet] ⛔ (0a) ソースの SCROLL_CATALOG_TV を正規表現で引けない (全 ' + DRV_CAT.length + ' 件 / common ' + DRV_COMMON.length + ' 件)');
  process.exit(3);
}
const PRICE_M = PRISTINE.match(/const SCROLL_SHELF_PRICE = (\d+);/);
if (!PRICE_M) { console.error('[vet] ⛔ ソースに const SCROLL_SHELF_PRICE = <n>; が無い'); process.exit(3); }
const PRICE = parseInt(PRICE_M[1], 10);
const byId = (id) => DRV_CAT.filter((c) => c.id === id)[0];
const SLEEP = DRV_COMMON.filter((c) => c.classKey === 'mage' && c.spellId === 'sleep')[0];
const BURN = byId('scroll-burning-hands'), BLESS = byId('tome-bless'), HAIL = byId('grimoire-hail-of-thorns');
if (!SLEEP || !BURN || !BLESS || !HAIL) { console.error('[vet] ⛔ ソースの表に scroll-sleep / scroll-burning-hands / tome-bless / grimoire-hail-of-thorns のどれかが無い'); process.exit(3); }

/* (4b) の比較範囲 = DF_PRICE_BY_RARITY の行 〜 dfShopSellPrice の行末 (改行は LF に揃える) */
function priceBlock(src) {
  const s = src.replace(/\r\n/g, '\n');
  const a = s.indexOf('  const DF_PRICE_BY_RARITY = ');
  const b = s.indexOf('  function dfShopSellPrice(item)');
  if (a < 0 || b < 0 || b < a) return null;
  const e = s.indexOf('\n', b);
  return s.slice(a, e);
}

/* ══════════════════════════════════════════════════════════════════════════════
 * 変異 (依頼書 §8 の負のコントロール 8 本)。逐語は HEAD d9b18d9 (項目2 の実装後) で取った。
 * 各変異の注入行は console.log("__MUTHIT__<key>") を同じ行に持つ (= 注入行が実行されたかを数える)。
 * ══════════════════════════════════════════════════════════════════════════════ */
const HIT = (k) => 'console.log("__MUTHIT__' + k + '")';
const MUTATIONS = {
  /* 罠A: 購入が localStorage を直接書き、画面が握る scrollStockTV を触らない */
  rawstock: [
    { from: '    scrollStockTV[id] = (scrollStockTV[id] || 0) + 1;' + EOL + '    saveScrollStockTV();',
      to:   '    { const _o = JSON.parse(localStorage.getItem("dragonfighters.scrollStock") || "{}"); _o[id] = (_o[id] || 0) + 1; localStorage.setItem("dragonfighters.scrollStock", JSON.stringify(_o)); ' + HIT('rawstock') + '; }' + EOL
          + '    /* ★変異rawstock: scrollStockTV を触らない */' }],
  /* 罠B: 習得済みを保存値 dragonfighters.knownSpells だけで判定する (初期習得 DEFAULT_KNOWN_TV を見ない) */
  rawknown: [
    { from: '    if (isSpellKnownTV(c.classKey, c.spellId)) return "known";',
      to:   '    if ((function () { ' + HIT('rawknown') + '; try { const _s = JSON.parse(localStorage.getItem("dragonfighters.knownSpells") || "{}"); return (_s[c.classKey] || []).indexOf(c.spellId) >= 0; } catch (e) { return false; } })()) return "known";   /* ★変異rawknown */' }],
  /* 罠C: 巻物の群で any = true を立てない */
  noany: [
    { from: '    if (shelfIds.length) {' + EOL + '      any = true;',
      to:   '    if (shelfIds.length) {' + EOL + '      ' + HIT('noany') + ';   /* ★変異noany: any を立てない */' }],
  /* 罠D: 撤退時も dfShopBuyScroll が通る (撤退を見ない common 抽出で品目を確かめる) */
  leakbuy: [
    { from: '    if (scrollShelfIds().indexOf(id) < 0) return { ok: false, reason: "noitem" };',
      to:   '    if (Object.keys(SCROLL_CATALOG_TV).filter(k => SCROLL_CATALOG_TV[k].rarity === "common").indexOf(id) < 0) return { ok: false, reason: "noitem" }; if (!isScrollShopOnTV()) ' + HIT('leakbuy') + ';   /* ★変異leakbuy */' }],
  /* 棚の絞り込みを外す (17 件並ぶ) */
  allrarity: [
    { from: '.filter(id => SCROLL_CATALOG_TV[id].rarity === "common")',
      to:   '.filter(id => (' + HIT('allrarity') + ', true))   /* ★変異allrarity */' }],
  /* 棚を ID 直書きにし、scroll-sleep を抜く (不採用の 3 種案) */
  idlist: [
    { from: '    return Object.keys(SCROLL_CATALOG_TV).filter(id => SCROLL_CATALOG_TV[id].rarity === "common");',
      to:   '    ' + HIT('idlist') + '; return ["scroll-burning-hands", "tome-bless", "grimoire-hail-of-thorns"];   /* ★変異idlist */' }],
  /* 所持中でも買える */
  nostockcap: [
    { from: '    if ((scrollStockTV[id] || 0) > 0) return "stocked";',
      to:   '    if ((scrollStockTV[id] || 0) > 0) ' + HIT('nostockcap') + ';   /* ★変異nostockcap: stocked を返さない */' }],
  /* 主人公の職業の巻物だけ並べる */
  herofilter: [
    { from: '.filter(id => SCROLL_CATALOG_TV[id].rarity === "common")',
      to:   '.filter(id => SCROLL_CATALOG_TV[id].rarity === "common" && (' + HIT('herofilter') + ', SCROLL_CATALOG_TV[id].classKey === shopHeroKey()))   /* ★変異herofilter */' }],
};
/* 変異 → 赤くなるべき assert (担当)。⚠⚠⚠ 机上で書かない。--mutate <key> で実走し、実際に赤くなった集合で決めた
 * (2026-09-30・HEAD d9b18d9 の上)。⭐ --negative は「赤の集合 = 担当」の完全一致を要求する。 */
const NEG_EXPECT = {
  rawstock:   ['(3a)', '(3c)'],                  // (3a) = scrollStock() が 0 のまま / (3c) = 読んだ時に古い scrollStockTV で上書きされ聖典が消える
  rawknown:   ['(2a)', '(3b)'],                  // (3b) = スリープが「買える」に化けて P-1 のボタンが 4 つになる
  noany:      ['(1e)'],
  leakbuy:    ['(5a)'],
  allrarity:  ['(1a)', '(1b)', '(1c)', '(1e)', '(3b)'],   // (1c)(1e) = 並ぶ件数が 17 / (3b) = ボタンが 16 個
  idlist:     ['(1a)', '(1c)', '(1e)', '(2a)', '(2c)'],   // (2a) = スリープの行が無い / (1c)(1e) = 3 件しか並ばない
  nostockcap: ['(2d)', '(3a)'],                  // (3a) = 押して買った行が「所持中」にならず買えるまま
  /* 主人公 戦士の新しいセーブでは棚が空になる ⇒ 棚を読む節がほぼ全部赤 (表示だけでなく購入も同じ関数を通る証拠) */
  herofilter: ['(1a)', '(1c)', '(1e)', '(2a)', '(2b)', '(2c)', '(2d)', '(3a)', '(3b)', '(3c)', '(3d)'],
};
/* 依頼書 §8 の予想 (⭐ これが実測の赤に含まれていることは崩さない = 起動時に検算)。
 * all = 全部赤 / any = どれか 1 つ以上が赤 (rawstock の「(3a) or (3c)」) */
const NEG_PREDICTED = {
  rawstock: { any: ['(3a)', '(3c)'] }, rawknown: { all: ['(2a)'] }, noany: { all: ['(1e)'] }, leakbuy: { all: ['(5a)'] },
  allrarity: { all: ['(1a)', '(1b)'] }, idlist: { all: ['(1a)', '(2c)'] }, nostockcap: { all: ['(2d)'] }, herofilter: { all: ['(1c)'] },
};
const MUT_ORDER = Object.keys(MUTATIONS);
if (MUT_ORDER.length > 8) { console.error('[vet] 変異は 8 本まで (ポート 10485〜10492)'); process.exit(3); }
if (MUT_ORDER.some((k) => !NEG_EXPECT[k] || !NEG_PREDICTED[k]) || Object.keys(NEG_EXPECT).some((k) => !MUTATIONS[k])) { console.error('[vet] NEG_EXPECT / NEG_PREDICTED と MUTATIONS が揃っていない'); process.exit(3); }
for (const k of MUT_ORDER) {
  const p = NEG_PREDICTED[k];
  const miss = (p.all || []).filter((x) => NEG_EXPECT[k].indexOf(x) < 0);
  const anyOk = !p.any || p.any.some((x) => NEG_EXPECT[k].indexOf(x) >= 0);
  if (miss.length || !anyOk) { console.error('[vet] 担当 ' + k + ' が依頼書 §8 の予想 ' + J(p) + ' を満たさない'); process.exit(3); }
}
if (MUTATE !== null && !Object.prototype.hasOwnProperty.call(MUTATIONS, MUTATE)) { console.error('[vet] 未知の --mutate: ' + MUTATE + '  (' + MUT_ORDER.join(' / ') + ')'); process.exit(3); }
for (const k of ONLY) if (!Object.prototype.hasOwnProperty.call(MUTATIONS, k)) { console.error('[vet] 未知の --only: ' + k + '  (' + MUT_ORDER.join(' / ') + ')'); process.exit(3); }

function countOf(hay, needle) { let n = 0, i = 0; while ((i = hay.indexOf(needle, i)) >= 0) { n++; i += needle.length; } return n; }
/* ⭐ 注入点の検算は**手つかずの原本**に対して数える (allrarity / herofilter は同じアンカーを共有するが互いに覆い隠さない)。 */
const _mutCache = {};
function servedTavern(key) {
  if (!key) return PRISTINE;
  if (_mutCache[key]) return _mutCache[key];
  let s = PRISTINE;
  for (const e of MUTATIONS[key]) {
    const c = countOf(PRISTINE, e.from);
    if (c !== 1) { console.error('[vet] ⛔ 変異 ' + key + ' の注入点がちょうど 1 箇所ではない (' + c + ' 件): ' + e.from.slice(0, 160)); process.exit(3); }
    if (countOf(PRISTINE, e.to) !== 0) { console.error('[vet] ⛔ 変異 ' + key + ' の注入文字列が原本に既に在る'); process.exit(3); }
    if (e.to.indexOf('__MUTHIT__' + key) < 0) { console.error('[vet] ⛔ 変異 ' + key + ' の注入行に実行の印が無い'); process.exit(3); }
    s = s.replace(e.from, () => e.to);
  }
  if (s.split('\n').length !== PRISTINE.split('\n').length || s === PRISTINE) {
    console.error('[vet] ⛔ 変異 ' + key + ' が行数を変えた / 何も変えていない'); process.exit(3);
  }
  _mutCache[key] = s;
  return s;
}
/* 起動時に全変異の注入点を検算する (素でも。アンカーの腐敗は素の走行でも exit 3 で知らせる) */
if (countOf(PRISTINE, '__MUTHIT__') !== 0) { console.error('[vet] ⛔ 原本に __MUTHIT__ が在る'); process.exit(3); }
for (const k of MUT_ORDER) servedTavern(k);
console.log('[vet] 装置: ソースの巻物 ' + DRV_CAT.length + ' 件 (common ' + DRV_COMMON.length + ') / SCROLL_SHELF_PRICE = ' + PRICE
  + ' / 変異 ' + MUT_ORDER.length + ' 本の注入点はすべて原本にちょうど 1 箇所 / 改行 ' + (EOL === '\r\n' ? 'CRLF' : 'LF'));

/* ══════════════════════════════════════════════════════════════════════════════
 * puppeteer / Chrome / 内蔵サーバ
 * ══════════════════════════════════════════════════════════════════════════════ */
function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  try { return require(path.join(os.tmpdir(), 'df_pptr', 'node_modules', 'puppeteer-core')); } catch (e) {}
  console.error('[vet] puppeteer-core が見つかりません'); process.exit(2);
}
function findBrowser() {
  const explicit = arg('browser', null);
  if (explicit) return explicit;
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) if (fs.existsSync(c)) return c;
  console.error('[vet] Chrome/Edge が見つかりません (--browser <path>)'); process.exit(2);
}
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8', '.css': 'text/css',
  '.json': 'application/json;charset=utf-8', '.md': 'text/markdown;charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const SERVERS = [];
function startServer(port, mutKey) {
  const tav = servedTavern(mutKey);
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/') u = '/index.html';
        const rel = u.replace(/^\/+/, '');
        res.setHeader('Cache-Control', 'no-store');
        if (rel === F_TAVERN) { res.setHeader('Content-Type', MIME['.html']); res.end(Buffer.from(tav, 'utf8')); return; }
        if (rel === F_BASE) { res.setHeader('Content-Type', MIME['.html']); res.end(Buffer.from(BASE_SRC, 'utf8')); return; }
        const fp = path.join(ROOT, rel);
        if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.statusCode = 404; res.end('404'); return; }
        res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
        fs.createReadStream(fp).pipe(res);
      } catch (e) { res.statusCode = 500; res.end('500'); }
    });
    srv.on('error', reject);
    srv.listen(port, '127.0.0.1', () => { SERVERS.push(srv); resolve(srv); });
  });
}
function stopServer(srv) {
  return new Promise((resolve) => {
    try { srv.closeAllConnections(); } catch (e) {}
    try { srv.close(() => resolve()); } catch (e) { resolve(); }
    const i = SERVERS.indexOf(srv); if (i >= 0) SERVERS.splice(i, 1);
  });
}

/* ══════════════════════════════════════════════════════════════════════════════
 * 結果
 * ══════════════════════════════════════════════════════════════════════════════ */
const ALL_IDS = ['(0a)', '(0b)', '(0c)', '(1a)', '(1b)', '(1c)', '(1d)', '(1e)', '(2a)', '(2b)', '(2c)', '(2d)',
  '(3a)', '(3b)', '(3c)', '(3d)', '(4a)', '(4b)', '(5a)'];
function mkResults() {
  const R = [];
  R.check = (id, name, ok, detail) => {
    ok = !!ok;
    detail = typeof detail === 'string' ? detail : J(detail);
    R.push({ id, name, ok, detail: detail || '' });
    console.log('  ' + (ok ? '✓' : '✗') + ' ' + id + ' ' + name + '  -- ' + (detail || '').slice(0, ok ? 300 : 600));
  };
  return R;
}
function summarize(R, label) {
  const passed = R.filter((r) => r.ok).length;
  const failed = R.filter((r) => !r.ok).length;
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  ' + passed + '/' + R.length + ' PASSED   FAILED ' + failed + '   PENDING 0' + (label ? '   ' + label : ''));
  if (failed) {
    console.log('  --- FAILED ---');
    R.filter((r) => !r.ok).forEach((r) => console.log('    ' + r.id + ' ' + r.name.slice(0, 80) + '  -- ' + r.detail.slice(0, 400)));
  }
  console.log('══════════════════════════════════════════════════════════');
  return { passed, failed };
}

/* ══════════════════════════════════════════════════════════════════════════════
 * ページ操作
 * ══════════════════════════════════════════════════════════════════════════════ */
/* localStorage を空にして seed だけ入れ、読み込み直す (新しいセーブ)。keep = true なら消さずに読み込み直すだけ。 */
async function load(ctx, file, qs, seed, keep) {
  const url = 'http://127.0.0.1:' + ctx.port + '/' + file + (qs || '');
  const page = ctx.page;
  if (!keep) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.evaluate((sd) => { localStorage.clear(); for (const k in (sd || {})) localStorage.setItem(k, sd[k]); }, seed || {});
  }
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => !!window.__equipTV, { timeout: 30000 });
  ctx.booted++;
}
/* #shopList を子の順に読む。⚠ 見出しは textContent の完全一致で探す (行の名前「巻物・スリープ」も「巻物」を含む) */
const shelfDom = (page) => page.evaluate(() => {
  const L = document.getElementById('shopList');
  const out = { heads: [], scroll: [], empty: false, emptyText: null, text: L ? L.textContent : null, headCount: 0 };
  if (!L) return out;
  const em = L.querySelector('.shopEmpty'); out.empty = !!em; out.emptyText = em ? em.textContent : null;
  let cur = null;
  for (const el of L.children) {
    if (el.classList.contains('shopGroupHead')) { cur = el.textContent; out.heads.push(cur); continue; }
    if (cur === '巻物' && el.classList.contains('shopItem')) {
      const b = el.querySelector('button.shopBtn'); const tg = el.querySelector('.shopEquipped'); const nm = el.querySelector('.shopName');
      out.scroll.push({ name: nm ? nm.textContent : null, btn: b ? b.textContent : null, disabled: b ? b.disabled : null, tag: tg ? tg.textContent : null });
    }
  }
  out.headCount = out.heads.length;
  return out;
});
const rowOf = (d, name) => d.scroll.filter((r) => r.name === name)[0] || null;
const stateOf = (shelf, id) => ((shelf || []).filter((x) => x.id === id)[0] || {}).state;

async function runSuite(browser, port, mutKey, label) {
  const R = mkResults();
  const ctx = { port, booted: 0, errs: [], hits: {} };
  const page = await browser.newPage();
  ctx.page = page;
  page.on('pageerror', (e) => ctx.errs.push(String((e && e.message) || e).slice(0, 300)));
  page.on('console', (m) => {
    let t = ''; try { t = m.text(); } catch (e) { return; }
    if (t.indexOf('__MUTHIT__') === 0) { const k = t.slice(10); ctx.hits[k] = (ctx.hits[k] || 0) + 1; }
  });
  const commonNames = DRV_COMMON.map((c) => c.name);
  const commonIds = DRV_COMMON.map((c) => c.id);
  const wantBtn = '購入 ' + PRICE + 'G';
  try {
    /* ── §0 (0a) (0b) + §1 (1a) (1b) + §2 (2a) (2b) ── 新しいセーブ・主人公 戦士 */
    await load(ctx, F_TAVERN, '', {});
    const pageCat = await page.evaluate(() => Object.keys(SCROLL_CATALOG_TV).map((id) => {
      const c = SCROLL_CATALOG_TV[id]; return { id, name: c.name, spellId: c.spellId, classKey: c.classKey, rarity: c.rarity };
    }));
    {
      /* ★[#78 §6] 全件数は固定しない (B/C で拾う巻物が増える)。⛔ common は 4 件で固定のまま —— common が増えたのか
       *   uncommon / rare が増えたのかを見分けるため (「18 件」へ書き換えるだけにしない = #77 §12-4)。 */
      const ok = DRV_CAT.length === DRV_COMMON.length + DRV_OTHER.length && DRV_OTHER.length >= 13 && DRV_COMMON.length === 4 && J(pageCat) === J(DRV_CAT);
      R.check('(0a)', '[装置] ソースから引いた巻物 = 全 ' + DRV_CAT.length + ' 件 (common 4 件 + それ以外 ' + DRV_OTHER.length + ' 件 ≥ 13)・ページの表と全件一致', ok,
        '全 ' + DRV_CAT.length + ' / common ' + DRV_COMMON.length + ' [' + commonIds.join(',') + '] / ページ ' + pageCat.length + ' 件'
        + (J(pageCat) === J(DRV_CAT) ? ' (一致)' : ' ⛔ 不一致'));
    }
    const bridge = await page.evaluate(() => ['scrollShelf', 'shopBuyScroll', 'scrollStock', 'learnScroll'].map((k) => typeof window.__equipTV[k]));
    await page.evaluate(() => { __equipTV.setGold(200); __equipTV.openShop(); });
    const d = await shelfDom(page);
    R.check('(0b)', '[装置] __equipTV の棚の 4 キーが関数・#shopList に .shopGroupHead が 1 つ以上', bridge.every((t) => t === 'function') && d.headCount >= 1,
      'typeof ' + J(bridge) + ' / 見出し ' + J(d.heads));
    const shelf0 = await page.evaluate(() => __equipTV.scrollShelf());
    {
      const scrollHeads = d.heads.filter((h) => h === '巻物').length;
      const ok = scrollHeads === 1 && J(d.scroll.map((r) => r.name)) === J(commonNames) && J(shelf0.map((x) => x.id)) === J(commonIds);
      R.check('(1a)', '新しいセーブ: 「巻物」の見出しが 1 つ・行の名前 = ソースの common 4 件 (順も)・ブリッジの id 列も同じ', ok,
        '見出し ' + J(d.heads) + ' / 行 ' + J(d.scroll.map((r) => r.name)) + ' / ブリッジ ' + J(shelf0.map((x) => x.id)) + ' / 期待 ' + J(commonNames));
    }
    {
      const leaked = DRV_OTHER.filter((c) => (d.text || '').indexOf(c.name) >= 0).map((c) => c.name);
      const bLeak = shelf0.filter((x) => commonIds.indexOf(x.id) < 0).map((x) => x.id);
      const ok = DRV_OTHER.length >= 13 && !!d.text && leaked.length === 0 && bLeak.length === 0;   // ★[#78 §6] 13 → ≥ 13
      R.check('(1b)', 'uncommon / rare の巻物 (' + DRV_OTHER.length + ' 件) の名前が #shopList に無い・ブリッジも common だけ', ok,
        '対象 ' + DRV_OTHER.length + ' 件 / DOM に出た ' + J(leaked) + ' / ブリッジに出た ' + J(bLeak));
    }
    const sleepBuy = await page.evaluate((id) => {
      const r = __equipTV.shopBuyScroll(id); return { r, gold: __equipTV.gold(), stock: __equipTV.scrollStock(), known: isSpellKnownTV('mage', 'sleep') };
    }, SLEEP.id);
    {
      const row = rowOf(d, SLEEP.name);
      const st = stateOf(shelf0, SLEEP.id);
      const ok = !!row && row.tag === '習得済み' && row.btn === null && st === 'known'
        && sleepBuy.r && sleepBuy.r.ok === false && sleepBuy.r.reason === 'known' && sleepBuy.gold === 200 && !sleepBuy.stock[SLEEP.id] && sleepBuy.known === true;
      R.check('(2a)', '新しいセーブ: スリープの行は「習得済み」でボタン無し・state known・shopBuyScroll = known (200G 所持)', ok,
        '行 ' + J(row) + ' / state ' + st + ' / 買う ' + J(sleepBuy));
    }
    {
      const others = DRV_COMMON.filter((c) => c.id !== SLEEP.id);
      const rows = others.map((c) => ({ id: c.id, st: stateOf(shelf0, c.id), row: rowOf(d, c.name) }));
      const ok = others.length === 3 && rows.every((x) => x.st === 'buyable' && x.row && x.row.btn === wantBtn && x.row.tag === null);
      R.check('(2b)', '他の common 3 件は state buyable・行に「' + wantBtn + '」のボタン', ok, rows);
    }

    /* ── (1d) 売却タブ ── */
    await page.evaluate(() => __equipTV.setShopTab('sell'));
    {
      const tab = await page.evaluate(() => shopTab);
      const ds = await shelfDom(page);
      const names = DRV_CAT.filter((c) => (ds.text || '').indexOf(c.name) >= 0).map((c) => c.name);
      const ok = tab === 'sell' && ds.text !== null && ds.heads.indexOf('巻物') < 0 && names.length === 0;
      R.check('(1d)', '売却タブに「巻物」の見出しも巻物の名前も無い', ok, 'shopTab=' + tab + ' / 見出し ' + J(ds.heads) + ' / 巻物の名前 ' + J(names));
    }

    /* ── (1c) 主人公の職業に依らない ── */
    {
      const got = {};
      for (const hk of ['warrior', 'cleric', 'mage', 'elf']) {
        await load(ctx, F_TAVERN, '', { 'dragonfighters.partyComposition': J([hk]) });
        await page.evaluate(() => __equipTV.openShop());
        const dh = await shelfDom(page);
        const info = await page.evaluate(() => ({ hero: shopHeroKey(), ids: __equipTV.scrollShelf().map((x) => x.id) }));
        got[hk] = { hero: info.hero, names: dh.scroll.map((r) => r.name), ids: info.ids };
      }
      const ok = Object.keys(got).every((hk) => got[hk].hero === hk && J(got[hk].names) === J(commonNames) && J(got[hk].ids) === J(commonIds));
      R.check('(1c)', '主人公を戦士・僧侶・魔法使い・エルフに変えても 4 件は同じ (shopHeroKey が実際に変わった)', ok,
        Object.keys(got).map((hk) => hk + '→hero=' + got[hk].hero + ' ' + got[hk].names.length + '件' + (J(got[hk].names) === J(commonNames) ? '' : ' ⛔' + J(got[hk].names))).join(' / '));
    }

    /* ── (1e) 罠C: 武器防具を全部持っていても空の文言が出ない ── */
    await load(ctx, F_TAVERN, '', { 'dragonfighters.gold': '200' });
    {
      const nOwned = await page.evaluate(() => {
        let n = 0;
        for (const kind of ['weapon', 'armor', 'shield']) shopPool(kind).forEach((it, t) => { if (!it.gated) { __equipTV.addOwned(kind, t, it); n++; } });
        __equipTV.setShopTab('buy'); __equipTV.openShop();
        return n;
      });
      const de = await shelfDom(page);
      const ok = nOwned >= 3 && !de.empty && J(de.heads) === J(['巻物']) && (de.text || '').indexOf('買える品はもうありません') < 0 && de.scroll.length === DRV_COMMON.length;
      R.check('(1e)', '武器防具を全部所持させても購入タブに「買える品はもうありません。」が出ない・見出しは「巻物」だけ', ok,
        '所持させた ' + nOwned + ' 品 / 見出し ' + J(de.heads) + ' / 空の文言 ' + J(de.emptyText) + ' / 棚の行 ' + de.scroll.length);
    }

    /* ── (2c) ?magesleep=0 ── */
    await load(ctx, F_TAVERN, '?magesleep=0', {});
    {
      await page.evaluate(() => __equipTV.openShop());
      const dm = await shelfDom(page);
      const info = await page.evaluate(() => ({ known: isSpellKnownTV('mage', 'sleep'), shelf: __equipTV.scrollShelf() }));
      const st = stateOf(info.shelf, SLEEP.id);
      const row = rowOf(dm, SLEEP.name);
      const ok = info.known === false && st === 'buyable' && !!row && row.btn === wantBtn && row.tag === null;
      R.check('(2c)', '?magesleep=0 ではスリープが buyable・行にボタン (isSpellKnownTV("mage","sleep") が偽)', ok,
        'isSpellKnownTV=' + info.known + ' / state ' + st + ' / 行 ' + J(row) + ' / 棚 ' + J(info.shelf.map((x) => x.id)));
    }

    /* ── (2d) 所持中 → 読んだ後は習得済み ── */
    await load(ctx, F_TAVERN, '', { 'dragonfighters.scrollStock': J({ [BURN.id]: 1 }), 'dragonfighters.gold': '200' });
    {
      await page.evaluate(() => __equipTV.openShop());
      const d1 = await shelfDom(page);
      const a = await page.evaluate((id) => {
        const st = (__equipTV.scrollShelf().filter((x) => x.id === id)[0] || {}).state;
        const r = __equipTV.shopBuyScroll(id);
        return { st, r, gold: __equipTV.gold(), stock: __equipTV.scrollStock()[id] || 0 };
      }, BURN.id);
      const b = await page.evaluate((id) => {
        const l = __equipTV.learnScroll(id); __equipTV.renderShop();
        return { learned: l.learned, st: (__equipTV.scrollShelf().filter((x) => x.id === id)[0] || {}).state, stock: __equipTV.scrollStock()[id] || 0 };
      }, BURN.id);
      const d2 = await shelfDom(page);
      const r1 = rowOf(d1, BURN.name), r2 = rowOf(d2, BURN.name);
      const ok = !!r1 && r1.tag === '所持中' && r1.btn === null && a.st === 'stocked' && a.r.ok === false && a.r.reason === 'stocked' && a.gold === 200 && a.stock === 1
        && b.learned === true && b.st === 'known' && b.stock === 0 && !!r2 && r2.tag === '習得済み' && r2.btn === null;
      R.check('(2d)', 'バーニングハンズ 1 冊所持 → 「所持中」・stocked・買えない / learnScroll の後は「習得済み」・known', ok,
        '前 行 ' + J(r1) + ' ' + J(a) + ' / 読後 ' + J(b) + ' 行 ' + J(r2));
    }

    /* ── (3a) 購入 → (3d) 読み込み直して書庫 ── */
    await load(ctx, F_TAVERN, '', {});
    {
      const a = await page.evaluate((id) => {
        __equipTV.setGold(200);
        const r = __equipTV.shopBuyScroll(id);
        return { r, gold: __equipTV.gold(), stock: __equipTV.scrollStock()[id] || 0, ls: (JSON.parse(localStorage.getItem('dragonfighters.scrollStock') || '{}'))[id] || 0 };
      }, BURN.id);
      await page.evaluate(() => __equipTV.openShop());
      const clicked = await page.evaluate((name) => {
        const rows = Array.from(document.querySelectorAll('#shopList .shopItem')).filter((r) => { const n = r.querySelector('.shopName'); return n && n.textContent === name; });
        const b = rows[0] && rows[0].querySelector('button.shopBtn'); if (!b || b.disabled) return false; b.click(); return true;
      }, HAIL.name);
      const c = await page.evaluate((id) => ({ gold: __equipTV.gold(), stock: __equipTV.scrollStock()[id] || 0,
        ls: (JSON.parse(localStorage.getItem('dragonfighters.scrollStock') || '{}'))[id] || 0 }), HAIL.id);
      const dc = await shelfDom(page);
      const rh = rowOf(dc, HAIL.name);
      const ok = a.r.ok === true && a.r.price === PRICE && a.gold === 200 - PRICE && a.stock === 1 && a.ls === 1
        && clicked && c.gold === 200 - 2 * PRICE && c.stock === 1 && c.ls === 1 && !!rh && rh.tag === '所持中';
      R.check('(3a)', '200G でバーニングハンズを買う → ok・金貨 200-P・scrollStock 1・localStorage 1 / ボタンでヘイルオブソーン → 200-2P・1・1・「所持中」', ok,
        'P=' + PRICE + ' / ブリッジ ' + J(a) + ' / クリック ' + clicked + ' ' + J(c) + ' 行 ' + J(rh));
    }
    await load(ctx, F_TAVERN, '', null, true);
    {
      const lib = await page.evaluate(() => {
        renderScrollLibrary();
        const sec = document.getElementById('scrollLibrarySection');
        return { shown: !!sec && sec.style.display !== 'none', names: Array.from(document.querySelectorAll('#scrollLibraryList .sName')).map((e) => e.textContent), stock: __equipTV.scrollStock() };
      });
      const has = (n) => lib.names.some((s) => s.indexOf(n) === 0);
      const ok = lib.shown && has(BURN.name) && has(HAIL.name) && lib.stock[BURN.id] === 1 && lib.stock[HAIL.id] === 1;
      R.check('(3d)', '買った後に読み込み直すと、書庫 (renderScrollLibrary → #scrollLibraryList) に買った 2 冊が出る', ok, lib);
    }

    /* ── (3b) 金貨不足 ── */
    await load(ctx, F_TAVERN, '', {});
    {
      const b = await page.evaluate((id, P) => {
        __equipTV.setGold(P - 1); __equipTV.openShop();
        const lsBefore = localStorage.getItem('dragonfighters.scrollStock');
        const r = __equipTV.shopBuyScroll(id);
        return { r, gold: __equipTV.gold(), stock: __equipTV.scrollStock(), lsBefore, lsAfter: localStorage.getItem('dragonfighters.scrollStock') };
      }, BLESS.id, PRICE);
      const dLow = await shelfDom(page);
      await page.evaluate((P) => { __equipTV.setGold(P); __equipTV.renderShop(); }, PRICE);
      const dEq = await shelfDom(page);
      const btnsLow = dLow.scroll.filter((r) => r.btn !== null), btnsEq = dEq.scroll.filter((r) => r.btn !== null);
      const ok = b.r.ok === false && b.r.reason === 'gold' && b.gold === PRICE - 1 && !b.stock[BLESS.id] && b.lsBefore === b.lsAfter
        && btnsLow.length === 3 && btnsLow.every((r) => r.disabled === true) && btnsEq.length === 3 && btnsEq.every((r) => r.disabled === false);
      R.check('(3b)', '金貨 P-1 ではボタン disabled (P ちょうどでは押せる)・shopBuyScroll = gold・金貨/所持品/localStorage 不変', ok,
        J(b) + ' / P-1 のボタン ' + J(btnsLow.map((r) => r.disabled)) + ' / P のボタン ' + J(btnsEq.map((r) => r.disabled)));
    }

    /* ── (3c) 罠A: 買う → 別の巻物を読む → まだ残っている ── */
    await load(ctx, F_TAVERN, '', { 'dragonfighters.scrollStock': J({ [BURN.id]: 1 }), 'dragonfighters.gold': '200' });
    {
      const c = await page.evaluate((bless, burn) => {
        const buy = __equipTV.shopBuyScroll(bless);
        const learn = __equipTV.learnScroll(burn);
        const st = __equipTV.scrollStock(); const ls = JSON.parse(localStorage.getItem('dragonfighters.scrollStock') || '{}');
        return { buy, learned: learn.learned, stBless: st[bless] || 0, lsBless: ls[bless] || 0, stBurn: st[burn] || 0, lsBurn: ls[burn] || 0 };
      }, BLESS.id, BURN.id);
      const ok = c.buy.ok === true && c.learned === true && c.stBless === 1 && c.lsBless === 1 && c.stBurn === 0 && c.lsBurn === 0;
      R.check('(3c)', '罠A: ブレスの聖典を買う → 持っていたバーニングハンズを読む → 聖典がまだ 1 冊 (scrollStock と localStorage)', ok, c);
    }

    /* ── §4 恒等: 素 / ?scrollshop=0 / HEAD~1 ── */
    const ARMS = [{ tag: '素', file: F_TAVERN, qs: '' }, { tag: '?scrollshop=0', file: F_TAVERN, qs: '?scrollshop=0' }, { tag: 'HEAD~1', file: F_BASE, qs: '' }];
    const trade = {}, prices = {};
    for (const arm of ARMS) {
      trade[arm.tag] = {};
      for (const hk of ['warrior', 'mage']) {
        await load(ctx, arm.file, arm.qs, { 'dragonfighters.partyComposition': J([hk]), 'dragonfighters.gold': '100000' });
        trade[arm.tag][hk] = await page.evaluate(() => {
          const out = [];
          for (const kind of ['weapon', 'armor', 'shield']) {
            const pool = shopPool(kind);
            for (let t = 0; t < pool.length; t++) {
              const g0 = __equipTV.gold(); const b = __equipTV.shopBuy(kind, t); const g1 = __equipTV.gold();
              const s = __equipTV.shopSell(kind, t); const g2 = __equipTV.gold();
              out.push({ kind, t, name: pool[t].name, b, db: g1 - g0, s, ds: g2 - g1 });
            }
          }
          return { hero: shopHeroKey(), out };
        });
      }
      prices[arm.tag] = await page.evaluate(() => {
        const rows = [];
        for (const ck of Object.keys(CHAR_EQUIP)) for (const k of ['weapons', 'armors', 'shields']) (CHAR_EQUIP[ck][k] || []).forEach((it, i) =>
          rows.push([ck, k, i, it.name, __equipTV.buyPrice(it), __equipTV.sellPrice(it), dfShopBuyPrice(it), dfShopSellPrice(it)]));
        return { rar: JSON.stringify(DF_PRICE_BY_RARITY), rows };
      });
    }
    {
      const s = trade['素'], off = trade['?scrollshop=0'], base = trade['HEAD~1'];
      const all = s.warrior.out.concat(s.mage.out);
      const okBuys = all.filter((x) => x.b && x.b.ok).length;
      const okSells = all.filter((x) => x.s && x.s.ok).length;
      const heroesOk = ARMS.every((a) => trade[a.tag].warrior.hero === 'warrior' && trade[a.tag].mage.hero === 'mage');
      const diffs = [];
      for (const hk of ['warrior', 'mage']) for (let i = 0; i < Math.max(s[hk].out.length, off[hk].out.length, base[hk].out.length); i++) {
        const a = J(s[hk].out[i]), b = J(off[hk].out[i]), c = J(base[hk].out[i]);
        if (a !== b || a !== c) diffs.push({ hk, i, now: a, off: b, base: c });
      }
      const ok = heroesOk && all.length >= 10 && okBuys >= 3 && okSells >= 3 && diffs.length === 0;
      R.check('(4a)', '武器防具の shopBuy / shopSell の戻り値と金貨の増減が 素 = ?scrollshop=0 = HEAD~1 (54bb89a) で全品一致 (戦士・魔法使い)', ok,
        '品 ' + all.length + '・買えた ' + okBuys + '・売れた ' + okSells + ' / 主人公 ' + heroesOk + (diffs.length ? ' / ⛔ 差 ' + diffs.length + ': ' + J(diffs.slice(0, 2)) : ' / 差 0'));
    }
    {
      const blkNow = priceBlock(servedTavern(mutKey)), blkBase = priceBlock(BASE_SRC);
      const p = prices['素'], pb = prices['HEAD~1'], po = prices['?scrollshop=0'];
      const rowDiff = p.rows.map((r, i) => (J(r) === J(pb.rows[i]) && J(r) === J(po.rows[i]) ? null : { now: r, base: pb.rows[i] })).filter(Boolean);
      const ok = !!blkNow && !!blkBase && blkNow === blkBase && p.rar === pb.rar && p.rar === po.rar
        && p.rows.length >= 20 && p.rows.length === pb.rows.length && p.rows.length === po.rows.length && rowDiff.length === 0;
      R.check('(4b)', 'DF_PRICE_BY_RARITY 〜 dfShopSellPrice のソースが HEAD~1 と同一・buyPrice / sellPrice / dfShopBuyPrice / dfShopSellPrice が全品一致', ok,
        'ソース ' + (blkNow && blkNow === blkBase ? '同一 (' + blkNow.length + ' 字)' : '⛔ ' + (blkNow ? '差あり' : '範囲が引けない')) + ' / 表 ' + p.rar
        + ' / 品 ' + p.rows.length + (rowDiff.length ? ' ⛔ 差 ' + rowDiff.length + ': ' + J(rowDiff.slice(0, 2)) : ' 差 0'));
    }

    /* ── (5a) 撤退 ── */
    await load(ctx, F_TAVERN, '?scrollshop=0', { 'dragonfighters.gold': '200' });
    {
      await page.evaluate(() => __equipTV.openShop());
      const d5 = await shelfDom(page);
      const g = await page.evaluate((id) => {
        const on = isScrollShopOnTV(); const shelf = __equipTV.scrollShelf(); const r = __equipTV.shopBuyScroll(id);
        return { on, shelf, r, gold: __equipTV.gold(), stock: __equipTV.scrollStock()[id] || 0, ls: (JSON.parse(localStorage.getItem('dragonfighters.scrollStock') || '{}'))[id] || 0 };
      }, BURN.id);
      const names = DRV_CAT.filter((c) => (d5.text || '').indexOf(c.name) >= 0).map((c) => c.name);
      const ok = g.on === false && d5.headCount >= 1 && d5.heads.indexOf('巻物') < 0 && names.length === 0 && Array.isArray(g.shelf) && g.shelf.length === 0
        && g.r.ok === false && g.r.reason === 'noitem' && g.gold === 200 && g.stock === 0 && g.ls === 0;
      R.check('(5a)', '?scrollshop=0 → 「巻物」の見出し無し (店は描かれている)・scrollShelf 空・shopBuyScroll = noitem・金貨/所持品不変', ok,
        '見出し ' + J(d5.heads) + ' / 巻物の名前 ' + J(names) + ' / ' + J(g));
    }

    /* ── (0c) 起動確認 ── */
    {
      const want = 1 + 4 + 1 + 1 + 1 + 2 + 1 + 1 + 6 + 1;   // (1a) / (1c)×4 / (1e) / (2c) / (2d) / (3a)+(3d) / (3b) / (3c) / §4 3 腕×2 職 / (5a)
      const ok = ctx.booted === want && ctx.errs.length === 0;
      R.check('(0c)', '[装置] 全ページが起動し (__equipTV が立つ) pageerror 0 件', ok, '起動 ' + ctx.booted + '/' + want + ' / pageerror ' + J(ctx.errs.slice(0, 3)));
    }
  } catch (e) {
    console.log('  ⛔ ' + label + ' 例外: ' + String((e && e.stack) || e).slice(0, 600));
    for (const id of ALL_IDS) if (!R.some((r) => r.id === id)) R.check(id, '(例外で判定できず)', false, String((e && e.message) || e).slice(0, 200));
  } finally {
    await new Promise((r) => setTimeout(r, 200));   // console イベントの取りこぼしを避ける
    await page.close().catch(() => {});
  }
  R.hits = ctx.hits;
  return R;
}

(async () => {
  const puppeteer = loadPuppeteer();
  const browserPath = findBrowser();
  const profile = require('./_pptr_profile')('df_verify_scrollshelf_');
  const browser = await puppeteer.launch({
    executablePath: browserPath, headless: !HEADFUL, protocolTimeout: 600000,
    args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
           '--disable-dev-shm-usage', '--user-data-dir=' + profile, '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  let exitCode = 0;
  const run = async (port, key, label) => {
    const srv = await startServer(port, key);
    console.log('\n[vet] ════════ ' + label + ' (port ' + port + ') ════════');
    const R = await runSuite(browser, port, key, label);
    await stopServer(srv);
    return R;
  };
  try {
    if (NEGATIVE) {
      const order = ONLY.length ? MUT_ORDER.filter((k) => ONLY.indexOf(k) >= 0) : MUT_ORDER;
      /* 素の基準。⭐⭐⭐ 素が赤いと変異の赤は何も意味しない。 */
      const R0 = await run(PORT, null, '(素・基準)');
      const s0 = summarize(R0, '[素・基準]');
      const hits0 = Object.keys(R0.hits);
      if (s0.failed || R0.length !== ALL_IDS.length || hits0.length) {
        console.error('[vet] ⛔ 素の基準で FAIL がある / 判定数が合わない / 変異の印が出た (' + J(R0.hits) + ') — 先にそれを直すこと (変異は走らせない)');
        exitCode = 1;
      } else {
        const report = [];
        for (const key of order) {
          const port = PORT + 1 + MUT_ORDER.indexOf(key);
          const R = await run(port, key, '[変異 ' + key + ']');
          summarize(R, '[変異 ' + key + ']');
          const red = R.filter((r) => !r.ok).map((r) => r.id);
          const r0c = R.filter((r) => r.id === '(0c)')[0];
          const bootOk = !!r0c && r0c.ok;   // ⭐ 構文破壊で全部赤くなる偽の検出を見分ける
          const hit = R.hits[key] || 0;
          const want = NEG_EXPECT[key] || [];
          const miss = want.filter((w) => red.indexOf(w) < 0);
          const leak = red.filter((x) => want.indexOf(x) < 0);
          const absent = ALL_IDS.filter((id) => !R.some((r) => r.id === id));
          const ok = bootOk && hit > 0 && want.length > 0 && miss.length === 0 && leak.length === 0 && absent.length === 0;
          console.log('[vet] --negative ' + key + ': 担当=' + want.join(',') + ' / 実際に赤くなった=' + (red.join(',') || '(なし)')
            + ' / 注入行の実行 ' + hit + ' 回 / 起動確認 ' + (bootOk ? 'OK' : 'NG') + ' → ' + (ok ? '✓ OK' : '✗ ' + (!bootOk ? '起動確認 NG ' : '') + (hit ? '' : '注入行が実行されていない ')
            + (miss.length ? '空振り ' + miss.join(',') + ' ' : '') + (leak.length ? '担当が絞れていない ' + leak.join(',') + ' ' : '') + (absent.length ? '判定が出ていない ' + absent.join(',') : '')));
          report.push({ key, want, red, ok, bootOk, hit });
          if (!ok) exitCode = 1;
        }
        console.log('\n════════════════════════════════════════');
        console.log('  負のコントロール ' + report.filter((r) => r.ok).length + ' / ' + report.length + ' が検出成功 (赤 = 担当に完全一致)');
        for (const r of report) console.log('   ' + (r.ok ? '・' : '⛔ ') + r.key.padEnd(11) + ' 担当 ' + r.want.join(',') + ' / 赤 ' + (r.red.join(',') || '(なし)') + ' / 注入行 ' + r.hit + ' 回 / 起動確認 ' + (r.bootOk ? 'OK' : 'NG'));
        console.log('════════════════════════════════════════');
        if (exitCode === 0) console.log('[vet] --negative OK: ' + report.length + ' 本すべて担当ラベルだけが赤くなりました (空振り 0・漏れ 0・注入行はすべて実行)');
        else console.error('[vet] --negative NG: ' + report.filter((r) => !r.ok).map((r) => r.key).join(','));
      }
    } else if (MUTATE) {
      const port = PORT + 1 + MUT_ORDER.indexOf(MUTATE);
      const R = await run(port, MUTATE, '[変異 ' + MUTATE + ' (手回し)]');
      summarize(R, '[変異 ' + MUTATE + ']');
      console.log('[vet] 赤くなった = ' + (R.filter((r) => !r.ok).map((r) => r.id).join(',') || '(なし)') + ' / 注入行の実行 ' + (R.hits[MUTATE] || 0) + ' 回');
      exitCode = 0;
    } else {
      const R = await run(PORT, null, '(素)');
      const s = summarize(R, '');
      const hits = Object.keys(R.hits);
      if (hits.length) console.error('[vet] ⛔ 素で変異の印が出た: ' + J(R.hits));
      exitCode = (s.failed || R.length !== ALL_IDS.length || hits.length) ? 1 : 0;
    }
  } catch (e) {
    console.error('[vet] 例外: ' + ((e && e.stack) || e));
    exitCode = 2;
  } finally {
    await browser.close().catch(() => {});
    for (const s of SERVERS.slice()) await stopServer(s);
  }
  console.log('[vet] 所要 ' + ((Date.now() - T_START) / 1000).toFixed(1) + ' 秒 / exit ' + exitCode);
  process.exit(exitCode);
})();
