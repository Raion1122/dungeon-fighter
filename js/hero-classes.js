/*
 * js/hero-classes.js — 名乗り(主人公選択)カードの **表示専用データ** v1
 * ------------------------------------------------------------------
 * 実装依頼書 `実装依頼書/2026-08-20_title-screen.md` の「新規作成 2」。
 *
 * ★ 何のためのデータか
 *   タイトル画面 title.html の画面 2「汝は何者か」に並ぶ 6 枚のクラスカードが出す文言。
 *     tagline … カードの表。一人称の答え(詩)
 *     role    … 1 タップ目で開く「立ち位置と役割」
 *     note    … 同上。持ち味を 1 行で
 *   初見のプレイヤーが「どれが強いのか分からない」で詰まるのを、**数字ではなく言葉**で解く。
 *
 * ★ 共有モジュール / クラシックスクリプト (ES module ではない)
 *   title.html と tavern.html が <script src="js/hero-classes.js"></script> で読み込む。
 *   js/save-slots.js・js/skill-check.js と同じ作法で、HTML 側に写しを作らない。
 *   ⚠ classic script 直下の let/const/function は window に載らない。
 *      よって公開データは下記のとおり **明示的に window へ代入**している。
 *
 * ★ なぜ数値 (HP / AC / 命中 / ダメージ) を 1 つも持たないのか  ⚠ 足さないこと
 *   実数は index.html の CLASS_DEFS が唯一の正。ここに書き写すと
 *   **バランス調整のたびに片方だけ古くなり、必ず腐る**(= 嘘の数字をプレイヤーに見せる)。
 *   このファイルが持ってよいのは「調整で動かない性質」= 役割と持ち味の言葉だけ。
 *
 * ★ zone は表示用だが、`PARTY_ZONES` と一致していなければ **嘘になる**
 *   PARTY_ZONES(tavern.html / index.html に同一定義)が前衛・中衛・後衛の実際の隊列を決めている。
 *   ここの zone がズレると「中衛・射る」と書いてあるのに前列に立つ、という食い違いが出る。
 *   → tools/verify_title_screen.js の受入条件 6. が、写経ではなく
 *     **2 経路(ブラウザで評価した PARTY_ZONES と、ブラウザで読み込んだ本ファイル)の突き合わせ**で
 *     6 職すべての一致を機械的に検査する。zone を触ったらそのドライバが赤くなる。
 *
 * ⚠ classKey は ALL_CLASS_KEYS(tavern.html)と同じ 6 つ。増減させるときは両方を見ること。
 */
(function (global) {
  "use strict";

  global.HERO_CLASSES = [
    { classKey: "warrior", name: "戦士",     zone: "front",
      tagline: "「剣を取った。理由は、それしか持っていなかったからだ。」",
      role: "前衛・盾で受ける", note: "被弾のたびに盾で受け返す。最も素直に強い" },
    { classKey: "dwarf",   name: "ドワーフ", zone: "front",
      tagline: "「山は落ちた。だが、山の民は落ちていない。」",
      role: "前衛・打ち合う",   note: "重い一撃と粘り強さ。罠と石造りに明るい" },
    { classKey: "cleric",  name: "僧侶",     zone: "mid",
      tagline: "「神は黙したままだ。ならば、この手が答える。」",
      role: "中衛・癒やす",     note: "傷を塞ぎ、不死者を退ける。長い探索に効く" },
    { classKey: "mage",    name: "魔法使い", zone: "rear",
      tagline: "「言葉には重さがある。私は、その量り方を知っている。」",
      role: "後衛・撃ち抜く",   note: "打たれ弱いが、届く距離と手数が違う" },
    { classKey: "elf",     name: "エルフ",   zone: "mid",
      tagline: "「森は焼けた。矢は、まだ残っている。」",
      role: "中衛・射る",       note: "弓と小魔法の両刀。器用に立ち回る" },
    { classKey: "rogue",   name: "盗賊",     zone: "mid",
      tagline: "「表から入る奴は、鍵の値打ちを知らない。」",
      role: "中衛・忍ぶ",       note: "影に隠れて急所を突く。錠前と罠の専門家" },
  ];
})(typeof window !== "undefined" ? window : this);
