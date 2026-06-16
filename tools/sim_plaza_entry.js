#!/usr/bin/env node
/*
 * sim_plaza_entry.js — ポドルプラザ初回入場までの所要クエスト回数 Monte Carlo 検証
 *
 * ゲームコードからの定数引用元 (2026-06-16 時点):
 *  - PLAZA_UNLOCK_QUEST_COUNT = 5            index.html:5915 / tavern.html:2504
 *  - pickChestLoot scroll 帯 0.84–0.96 = 12% index.html:12324
 *  - chest scroll 重み common55/uncommon35/rare10  pickScrollId index.html:5865
 *  - boss scroll 確定・重み common15/uncommon50/rare35  maybeGrantScrollDrop index.html:5884
 *  - レア巻物 5 種 → P(polymorph|rare)=1/5   SCROLL_CATALOG index.html:5791-5810
 *  - POLYMORPH_WAND_DROP_CHANCE = 0.15 (低Tierボスのみ・wandDropEnabled後) index.html:5899-5906
 *  - 部屋宝箱: 4 部屋 × CHEST_SPAWN_CHANCE 0.5 = 期待2  spawnRoomChests index.html:12343
 *  - 隠し宝箱(確定): Tier I=2/II=3/III=4/IV=5  tavern.html:1486+
 *  - 生成クエストのボスは isBoss:true (例 goblinKing index.html:3749)
 *  - polymorph 呪文は mage/elf のみ入場に使える  hasInnateDisguise tavern.html:3561
 *  - 杖は全職で使える  consumeChargeTV tavern.html:2315
 *
 * 本スクリプトはゲーム本体を一切読み書きしない純検証ツール。
 */

"use strict";

// ── 定数 ──
const UNLOCK_CLEARS = 5;
const CHEST_SCROLL_P = 0.12;
const ROOM_CHESTS = 4;          // B/C/D/E 各 50%
const ROOM_CHEST_P = 0.5;
const HIDDEN_CHESTS = { 1: 2, 2: 3, 3: 4, 4: 5 };
const RARE_POLYMORPH_P = 1 / 5; // レア巻物 5 種中 polymorph 1 種

// rarity 重み → P(rare)
const CHEST_RARE_P = 10 / (55 + 35 + 10); // = 0.10
const BOSS_RARE_P = 35 / (15 + 50 + 35);  // = 0.35

const WAND_DROP_P = 0.15;

// 1 クエストの宝箱個数 (期待値ではなく実抽選): 部屋宝箱(Bernoulli) + 隠し宝箱(確定)
function rollChestCount(tier) {
  let n = HIDDEN_CHESTS[tier] || 0;
  for (let i = 0; i < ROOM_CHESTS; i++) if (Math.random() < ROOM_CHEST_P) n++;
  return n;
}

// このクエストで polymorph 巻物を 1 個以上拾うか
function questYieldsPolymorphScroll(tier) {
  // ボス確定スクロール
  if (Math.random() < BOSS_RARE_P && Math.random() < RARE_POLYMORPH_P) return true;
  // 各宝箱
  const chests = rollChestCount(tier);
  for (let i = 0; i < chests; i++) {
    if (Math.random() < CHEST_SCROLL_P && Math.random() < CHEST_RARE_P && Math.random() < RARE_POLYMORPH_P) {
      return true;
    }
  }
  return false;
}

// 1 試行: 新規セーブ→入場成立までの questCount を返す
// opts: { caster: bool, tier: 1|2|3|4, scrollRoute: bool, wandRoute: bool }
function simulateOnce(opts) {
  let clears = 0;
  let questCount = 0;
  let polymorphKnown = false;
  let wandHeld = false;
  let wandDropEnabled = false;
  const lowTier = opts.tier <= 2;
  const SAFETY = 100000; // 無限ループ保険 (詰み構成の検出用)

  while (questCount < SAFETY) {
    questCount++;
    clears++;

    // スクロール拾得 (キャスターは即「読む」前提で polymorphKnown 化)
    if (opts.scrollRoute && opts.caster && !polymorphKnown) {
      if (questYieldsPolymorphScroll(opts.tier)) polymorphKnown = true;
    }
    // 杖ドロップ (低Tier・wandDropEnabled・ボス15%)
    if (opts.wandRoute && wandDropEnabled && lowTier && !wandHeld) {
      if (Math.random() < WAND_DROP_P) wandHeld = true;
    }

    const doorUnlocked = clears >= UNLOCK_CLEARS;

    // 入場判定
    const hasDisguise = (opts.caster && polymorphKnown) || wandHeld;
    if (doorUnlocked && hasDisguise) return questCount;

    // 扉解放直後の門番ステップ (まだ手段なし → 杖ドロップ解放。クエスト消費なし)
    if (doorUnlocked && !hasDisguise && opts.wandRoute && !wandDropEnabled) {
      wandDropEnabled = true;
    }
  }
  return Infinity; // 詰み (例: 高Tier周回の非キャスター)
}

function run(opts, trials) {
  const xs = [];
  let stuck = 0;
  for (let i = 0; i < trials; i++) {
    const q = simulateOnce(opts);
    if (q === Infinity) { stuck++; continue; }
    xs.push(q);
  }
  xs.sort((a, b) => a - b);
  const n = xs.length;
  const mean = n ? xs.reduce((a, b) => a + b, 0) / n : Infinity;
  const pct = (p) => n ? xs[Math.min(n - 1, Math.floor(p * n))] : Infinity;
  const within = (k) => n ? xs.filter(x => x <= k).length / trials : 0;
  return {
    mean, median: pct(0.5), p10: pct(0.10), p90: pct(0.90),
    le5: within(5), le10: within(10), stuckRate: stuck / trials,
  };
}

const TRIALS = 100000;
const fmt = (x) => (x === Infinity ? "∞" : x.toFixed(2));
const pctS = (x) => (x * 100).toFixed(1) + "%";

function printRow(label, r) {
  console.log(
    label.padEnd(34) +
    fmt(r.mean).padStart(8) +
    fmt(r.median).padStart(9) +
    fmt(r.p10).padStart(7) +
    fmt(r.p90).padStart(8) +
    pctS(r.le5).padStart(9) +
    pctS(r.le10).padStart(9) +
    (r.stuckRate > 0 ? pctS(r.stuckRate).padStart(9) : "—".padStart(9))
  );
}

console.log(`\n=== ポドルプラザ初回入場までの所要クエスト回数 (試行 ${TRIALS.toLocaleString()}) ===\n`);
console.log(
  "シナリオ".padEnd(30) + "平均".padStart(8) + "中央値".padStart(9) +
  "p10".padStart(7) + "p90".padStart(8) + "≤5回".padStart(9) + "≤10回".padStart(9) + "詰み率".padStart(9)
);
console.log("-".repeat(89));

// 主シナリオ: 低Tier(I/II)周回・新規セーブ起点
printRow("キャスター(巻物+杖) 低Tier",
  run({ caster: true, tier: 1, scrollRoute: true, wandRoute: true }, TRIALS));
printRow("非キャスター(杖のみ) 低Tier",
  run({ caster: false, tier: 1, scrollRoute: false, wandRoute: true }, TRIALS));

console.log("");
// 参考: 高Tier(III/IV)のみ周回
printRow("キャスター(巻物のみ) 高Tier",
  run({ caster: true, tier: 4, scrollRoute: true, wandRoute: true }, TRIALS));
printRow("非キャスター(杖のみ) 高Tier",
  run({ caster: false, tier: 4, scrollRoute: false, wandRoute: true }, TRIALS));

console.log("");
// 整合チェック用の縮退モード
printRow("[照合]キャスター巻物単独 低Tier",
  run({ caster: true, tier: 1, scrollRoute: true, wandRoute: false }, TRIALS));

// 解析期待値の併記
const pBossPoly = BOSS_RARE_P * RARE_POLYMORPH_P;
const pChestPoly = CHEST_SCROLL_P * CHEST_RARE_P * RARE_POLYMORPH_P;
const expChestsT1 = HIDDEN_CHESTS[1] + ROOM_CHESTS * ROOM_CHEST_P;
const pQuestPolyT1 = 1 - (1 - pBossPoly) * Math.pow(1 - pChestPoly, expChestsT1);
console.log("\n--- 解析チェック値 (低Tier I) ---");
console.log(`  P(ボス→polymorph)        = ${pBossPoly.toFixed(4)}`);
console.log(`  P(宝箱1個→polymorph)     = ${pChestPoly.toFixed(4)}`);
console.log(`  P(1クエストで巻物入手)   ≈ ${pQuestPolyT1.toFixed(4)}  → 平均 ≈ ${(1 / pQuestPolyT1).toFixed(2)} 回 (巻物単独)`);
console.log(`  杖: 解放後 P=0.15/q      → 5 + 1/0.15 ≈ ${(5 + 1 / WAND_DROP_P).toFixed(2)} 回 (非キャスター期待値)`);
console.log("");
