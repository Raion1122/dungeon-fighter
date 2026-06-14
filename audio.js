/* ============================================================================
 * audio.js — ダンジョンファイターズ プロシージャル音システム (Web Audio API)
 *   - 音源ファイル不要。全て合成 (チップチューン/8-bit)。file:// と Pages 両対応。
 *   - index.html / tavern.html が <script src="audio.js"> で共有読込。
 *   - グローバル: GameAudio (再生API) / GameSettings (localStorage 設定)
 *   - Web Audio 非対応/構築失敗時は全API 無音 no-op (ゲームは無音で正常動作)
 * ========================================================================== */
(function (global) {
  "use strict";

  // ===== Section A: 設定ストア (GameSettings) =================================
  var SETTINGS_KEY = "dragonfighters.settings";
  var DEFAULTS = { master: 0.8, bgm: 0.6, sfx: 0.9, voice: 0.95, muted: false, textSpeed: 70 };
  var _cache = null;

  function clamp(v, lo, hi) { v = +v; if (isNaN(v)) return lo; return v < lo ? lo : (v > hi ? hi : v); }
  function normalize(s) {
    s = s || {};
    return {
      master: clamp(s.master, 0, 1),
      bgm: clamp(s.bgm, 0, 1),
      sfx: clamp(s.sfx, 0, 1),
      voice: clamp(s.voice, 0, 1),
      muted: !!s.muted,
      textSpeed: clamp(s.textSpeed, 0, 200),
    };
  }
  function loadSettings() {
    try {
      var raw = global.localStorage ? localStorage.getItem(SETTINGS_KEY) : null;
      var obj = raw ? JSON.parse(raw) : {};
      var merged = {}; for (var k in DEFAULTS) merged[k] = DEFAULTS[k];
      for (var k2 in obj) if (obj.hasOwnProperty(k2)) merged[k2] = obj[k2];
      return normalize(merged);
    } catch (e) { return normalize(DEFAULTS); }
  }
  function persist(obj) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(obj)); } catch (e) {} }

  var GameSettings = {
    get: function () { if (!_cache) _cache = loadSettings(); return _cache; },
    patch: function (partial) {
      var cur = GameSettings.get(); var next = {};
      for (var k in cur) next[k] = cur[k];
      for (var k2 in partial) if (partial.hasOwnProperty(k2)) next[k2] = partial[k2];
      _cache = normalize(next); persist(_cache); return _cache;
    },
    reload: function () { _cache = loadSettings(); return _cache; },
  };

  // ===== Section B: AudioContext ライフサイクル ==============================
  var AC = global.AudioContext || global.webkitAudioContext;
  var supported = (typeof AC === "function");
  var ctx = null, initFailed = false, unlocked = false, buses = null;
  var pendingBgm = null;
  var noiseBufRef = null, noiseBufCtx = null;
  // 合成SFXの再生ごとゆらぎ係数。playSfx が再生直前に乱数を入れ、直後に1へ戻す(同期実行)。
  // 待機時は常に1なので、同じ tone/noise を使う合成BGM(setInterval駆動)には干渉しない。
  var _sfxPitch = 1, _sfxGain = 1;
  var duckSfx = null, duckUi = null;   // ナレ音声中に SFX/UI を下げるダッキング係数 (user音量とは独立)

  function ensureContext() {
    if (ctx) return ctx;
    if (!supported || initFailed) return null;
    try { ctx = new AC(); buildBuses(); return ctx; }
    catch (e) { initFailed = true; return null; }
  }
  function buildBuses() {
    var master = ctx.createGain(), bgm = ctx.createGain(), sfx = ctx.createGain(), ui = ctx.createGain(), voice = ctx.createGain();
    duckSfx = ctx.createGain(); duckUi = ctx.createGain();
    duckSfx.gain.value = 1; duckUi.gain.value = 1;
    master.connect(ctx.destination);
    bgm.connect(master); voice.connect(master);
    sfx.connect(duckSfx); duckSfx.connect(master);   // sfx → duckSfx → master (ダッキング用の中間段)
    ui.connect(duckUi); duckUi.connect(master);       // ui  → duckUi  → master
    buses = { master: master, bgm: bgm, sfx: sfx, ui: ui, voice: voice };
    applyVolumes();
  }
  // ナレ音声中は SFX/UI を -6dB(0.5)へ下げ、終了で戻す。user音量(buses.sfx/ui)とは独立した係数。
  var _duckLevel = 1;   // 現在の duck 目標値 (検証用シャドウ。0.5=発話中, 1.0=通常)
  function setDuck(target, tc) {
    _duckLevel = target;
    if (!ctx) return;
    var now = ctx.currentTime;
    var nodes = [duckSfx, duckUi];
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i]; if (!n) continue;
      try { n.gain.cancelScheduledValues(now); n.gain.setTargetAtTime(target, now, tc); }
      catch (e) { try { n.gain.value = target; } catch (e2) {} }
    }
  }
  function duckForVoice() { setDuck(0.5, 0.05); }   // ≈ -6dB、~0.15s で収束
  function unduck() { setDuck(1.0, 0.13); }          // ~0.4s で復帰
  function setGain(node, v, t) {
    try { node.gain.setTargetAtTime(v, t, 0.015); } catch (e) { try { node.gain.value = v; } catch (e2) {} }
  }
  function applyVolumes() {
    if (!buses) return;
    var s = GameSettings.get();
    var t = ctx ? ctx.currentTime : 0;
    setGain(buses.master, s.muted ? 0 : s.master, t);
    setGain(buses.bgm, s.bgm, t);
    setGain(buses.sfx, s.sfx, t);
    setGain(buses.ui, s.sfx * 0.9, t);
    setGain(buses.voice, s.voice, t);
    applyFileBgmVolume();                                     // ファイルBGM(mp3)の音量/ミュートも同期
  }
  function unlock() {
    if (!ensureContext()) return;
    try { if (ctx.state === "suspended") ctx.resume(); } catch (e) {}
    if (!unlocked) {
      try {
        var b = ctx.createBuffer(1, 1, ctx.sampleRate || 44100);
        var s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0);
      } catch (e) {}
      unlocked = true;
    }
    ensureBgmEl();   // ファイルBGM用 <audio>+MediaElementSource をジェスチャ内で用意 (iOS で後続 play() を許可)
    if (pendingBgm) { var p = pendingBgm; pendingBgm = null; playBgm(p); }
  }

  // ===== Section D: voice プリミティブ (純関数: (ctx,dest,t0,opts)) ===========
  function getNoiseBuf(c) {
    if (noiseBufRef && noiseBufCtx === c) return noiseBufRef;
    var sr = c.sampleRate || 44100;
    var len = Math.floor(sr * 1.0);
    var buf = c.createBuffer(1, len, sr);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    noiseBufRef = buf; noiseBufCtx = c; return buf;
  }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  var NOTE_IDX = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 };
  function noteToFreq(n) {
    if (!n || n === "-" || n === "_") return 0;
    var m = /^([A-G][#b]?)(-?\d)$/.exec(n);
    if (!m) return 0;
    var midi = (parseInt(m[2], 10) + 1) * 12 + NOTE_IDX[m[1]];
    return mtof(midi);
  }
  function tone(c, dest, t0, o) {
    o = o || {};
    var osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || "square";
    var f = Math.max(1, (o.freq || 440) * _sfxPitch);
    osc.frequency.setValueAtTime(f, t0);
    if (o.glideTo) { try { osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.glideTo * _sfxPitch), t0 + (o.dur || 0.2)); } catch (e) {} }
    if (o.detune) { try { osc.detune.setValueAtTime(o.detune, t0); } catch (e) {} }
    var peak = (o.peak == null ? 0.25 : o.peak) * _sfxGain;
    var a = (o.a == null ? 0.005 : o.a);
    var dur = o.dur || 0.2;
    var rel = (o.r == null ? 0.05 : o.r);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.setTargetAtTime(0.0001, t0 + Math.max(a, dur - rel), rel * 0.5 + 0.01);
    osc.connect(g); g.connect(dest);
    osc.start(t0); osc.stop(t0 + dur + 0.12);
  }
  function noise(c, dest, t0, o) {
    o = o || {};
    var src = c.createBufferSource(); src.buffer = getNoiseBuf(c);
    var dur = o.dur || 0.15;
    var filt = c.createBiquadFilter();
    filt.type = o.filter || "lowpass";
    filt.frequency.setValueAtTime((o.cutoff || 1000) * _sfxPitch, t0);
    if (o.cutoffTo) { try { filt.frequency.exponentialRampToValueAtTime(Math.max(40, o.cutoffTo * _sfxPitch), t0 + dur); } catch (e) {} }
    if (o.q) { try { filt.Q.setValueAtTime(o.q, t0); } catch (e) {} }
    var g = c.createGain();
    var peak = (o.peak == null ? 0.2 : o.peak) * _sfxGain;
    var a = (o.a == null ? 0.002 : o.a);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.setTargetAtTime(0.0001, t0 + a, Math.max(0.01, dur * 0.4));
    src.connect(filt); filt.connect(g); g.connect(dest);
    var off = 0; try { off = Math.random() * 0.4; } catch (e) {}
    src.start(t0, off, dur + 0.05); src.stop(t0 + dur + 0.1);
  }
  function arp(c, dest, t0, o) {
    o = o || {};
    var steps = o.steps || [0, 4, 7], root = (o.root == null ? 60 : o.root), sd = o.stepDur || 0.06;
    for (var i = 0; i < steps.length; i++) {
      tone(c, dest, t0 + i * sd, { type: o.type || "square", freq: mtof(root + steps[i]), dur: o.dur || sd * 1.4, peak: (o.peak == null ? 0.2 : o.peak) });
    }
  }

  // ----- メタル化: ディストーションカーブ + パワーコード/ツインリード -----
  // 有理 soft-clip カーブ (ctx 非依存・キャッシュ付き)。amount が大きいほど歪む。
  var _distCache = {};
  function makeDistortionCurve(amount) {
    var a = amount > 0 ? amount : 0, key = a.toFixed(2);
    if (_distCache[key]) return _distCache[key];
    var n = 1024, curve = new Float32Array(n), k = a * 100;
    for (var i = 0; i < n; i++) { var x = (i / (n - 1)) * 2 - 1; curve[i] = (1 + k) * x / (1 + k * Math.abs(x)); }
    _distCache[key] = curve; return curve;
  }
  // 周波数比でパワーコード/ハモリを構成 (tone 自体は無改造のまま重ねる)
  var FIFTH = Math.pow(2, 7 / 12), MIN3 = Math.pow(2, 3 / 12), MAJ3 = Math.pow(2, 4 / 12);
  function emitChord(c, dest, when, f, type, dur, gain, power, harmony) {
    if (!f) return;
    tone(c, dest, when, { type: type, freq: f, dur: dur, peak: gain });                                       // root
    if (power >= 1) tone(c, dest, when, { type: type, freq: f * FIFTH, dur: dur, peak: gain * 0.85 });          // 5度
    if (power >= 2) tone(c, dest, when, { type: type, freq: f * 2, dur: dur, peak: gain * 0.7 });               // oct
    if (harmony) tone(c, dest, when, { type: type, freq: f * (harmony === 2 ? MAJ3 : MIN3), dur: dur, peak: gain * 0.65 }); // ツインリード
  }

  // ===== Section E: SFX ライブラリ ==========================================
  var SFX = {
    hit: function (c, d, t) { noise(c, d, t, { dur: 0.09, peak: 0.28, cutoff: 1400, cutoffTo: 500 }); tone(c, d, t, { freq: 150, glideTo: 90, dur: 0.08, peak: 0.18 }); },
    miss: function (c, d, t) { noise(c, d, t, { dur: 0.13, peak: 0.13, filter: "bandpass", cutoff: 1800, cutoffTo: 600, q: 0.8 }); },
    crit: function (c, d, t) { noise(c, d, t, { dur: 0.1, peak: 0.3, cutoff: 1800, cutoffTo: 600 }); arp(c, d, t + 0.02, { type: "square", root: 72, steps: [0, 7, 12], stepDur: 0.05, peak: 0.22 }); },
    fumble: function (c, d, t) { tone(c, d, t, { freq: mtof(55), glideTo: mtof(48), dur: 0.18, peak: 0.18, detune: -20 }); noise(c, d, t + 0.02, { dur: 0.12, peak: 0.12, cutoff: 500 }); },
    allyHit: function (c, d, t) { noise(c, d, t, { dur: 0.08, peak: 0.22, cutoff: 1600, cutoffTo: 700 }); tone(c, d, t, { type: "triangle", freq: 200, glideTo: 120, dur: 0.07, peak: 0.16 }); },
    enemyHit: function (c, d, t) { noise(c, d, t, { dur: 0.07, peak: 0.2, cutoff: 900, cutoffTo: 400 }); },
    spellDamage: function (c, d, t) { tone(c, d, t, { type: "sawtooth", freq: 800, glideTo: 200, dur: 0.3, peak: 0.16, detune: 8 }); tone(c, d, t, { type: "sawtooth", freq: 808, glideTo: 196, dur: 0.3, peak: 0.12, detune: -8 }); },
    heal: function (c, d, t) { tone(c, d, t, { type: "triangle", freq: mtof(64), glideTo: mtof(71), dur: 0.35, peak: 0.2, a: 0.03 }); tone(c, d, t + 0.05, { type: "sine", freq: mtof(76), dur: 0.3, peak: 0.1, a: 0.04 }); },
    buff: function (c, d, t) { arp(c, d, t, { type: "triangle", root: 60, steps: [0, 4, 7], stepDur: 0.07, peak: 0.16, dur: 0.12 }); },
    enemyDeath: function (c, d, t) { tone(c, d, t, { type: "sawtooth", freq: 400, glideTo: 60, dur: 0.45, peak: 0.2 }); noise(c, d, t + 0.05, { dur: 0.3, peak: 0.12, cutoff: 800, cutoffTo: 200 }); },
    bossDeath: function (c, d, t) { tone(c, d, t, { type: "sawtooth", freq: 300, glideTo: 45, dur: 0.7, peak: 0.24 }); tone(c, d, t, { freq: 70, glideTo: 35, dur: 0.7, peak: 0.14 }); noise(c, d, t + 0.1, { dur: 0.5, peak: 0.14, cutoff: 700, cutoffTo: 150 }); tone(c, d, t + 0.55, { type: "sine", freq: mtof(84), dur: 0.3, peak: 0.16, a: 0.01 }); },
    counter: function (c, d, t) { noise(c, d, t, { dur: 0.08, peak: 0.2, filter: "bandpass", cutoff: 3500, q: 3 }); tone(c, d, t + 0.02, { freq: mtof(72), glideTo: mtof(79), dur: 0.1, peak: 0.18 }); },
    sneak: function (c, d, t) { noise(c, d, t, { dur: 0.25, peak: 0.1, cutoff: 900, cutoffTo: 500 }); },
    playerDamage: function (c, d, t) { tone(c, d, t, { freq: 110, glideTo: 80, dur: 0.14, peak: 0.2, detune: -15 }); noise(c, d, t, { dur: 0.1, peak: 0.12, cutoff: 800 }); },
    allyDamage: function (c, d, t) { tone(c, d, t, { freq: 150, glideTo: 110, dur: 0.1, peak: 0.16 }); },
    chestFound: function (c, d, t) { tone(c, d, t, { type: "sine", freq: mtof(72), dur: 0.12, peak: 0.18, a: 0.01 }); tone(c, d, t + 0.1, { type: "sine", freq: mtof(77), dur: 0.16, peak: 0.18, a: 0.01 }); },
    chestOpen: function (c, d, t) { noise(c, d, t, { dur: 0.18, peak: 0.14, filter: "bandpass", cutoff: 1200, cutoffTo: 2600, q: 1.2 }); tone(c, d, t + 0.14, { freq: mtof(84), dur: 0.12, peak: 0.16 }); },
    hiddenFound: function (c, d, t) { arp(c, d, t, { type: "sine", root: 67, steps: [0, 3, 7], stepDur: 0.1, peak: 0.16, dur: 0.18 }); },
    trap: function (c, d, t) { tone(c, d, t, { type: "sawtooth", freq: 300, glideTo: 70, dur: 0.2, peak: 0.2, detune: 12 }); noise(c, d, t, { dur: 0.18, peak: 0.16, filter: "highpass", cutoff: 1200 }); },
    cageOpen: function (c, d, t) { noise(c, d, t, { dur: 0.16, peak: 0.18, filter: "bandpass", cutoff: 2200, q: 2 }); tone(c, d, t + 0.02, { freq: 90, glideTo: 70, dur: 0.18, peak: 0.16 }); tone(c, d, t + 0.18, { freq: mtof(76), dur: 0.12, peak: 0.14 }); },
    levelUp: function (c, d, t) { arp(c, d, t, { type: "square", root: 60, steps: [0, 4, 7, 12], stepDur: 0.09, peak: 0.2, dur: 0.16 }); tone(c, d, t + 0.36, { type: "triangle", freq: mtof(72), dur: 0.25, peak: 0.18, a: 0.01 }); },
    coin: function (c, d, t) { tone(c, d, t, { freq: mtof(83), dur: 0.06, peak: 0.18 }); tone(c, d, t + 0.06, { freq: mtof(88), dur: 0.12, peak: 0.18 }); },
    button: function (c, d, t) { tone(c, d, t, { freq: 660, dur: 0.03, peak: 0.12, a: 0.001 }); },
    narration: function (c, d, t) { tone(c, d, t, { type: "sine", freq: 880, dur: 0.012, peak: 0.05, a: 0.001 }); },
    // 素材別ヒット音 + スイング (レイヤリング playLayered 用)。tone/noise 経由でゆらぎ自動適用。
    sword_swing: function (c, d, t) { noise(c, d, t, { dur: 0.12, peak: 0.15, filter: "bandpass", cutoff: 600, cutoffTo: 2400, q: 0.8 }); noise(c, d, t + 0.01, { dur: 0.20, peak: 0.30, filter: "bandpass", cutoff: 2900, cutoffTo: 6400, q: 10 }); tone(c, d, t + 0.01, { type: "square", freq: 2500, glideTo: 3800, dur: 0.13, peak: 0.12, a: 0.001, r: 0.09 }); tone(c, d, t + 0.02, { type: "triangle", freq: 3300, dur: 0.18, peak: 0.08, a: 0.001 }); },
    hit_flesh: function (c, d, t) { noise(c, d, t, { dur: 0.09, peak: 0.26, cutoff: 1200, cutoffTo: 420 }); tone(c, d, t, { freq: 140, glideTo: 80, dur: 0.08, peak: 0.16 }); },
    hit_bone: function (c, d, t) { noise(c, d, t, { dur: 0.06, peak: 0.22, filter: "highpass", cutoff: 2400 }); tone(c, d, t, { type: "square", freq: mtof(84), glideTo: mtof(72), dur: 0.07, peak: 0.14 }); tone(c, d, t + 0.005, { freq: 320, glideTo: 180, dur: 0.05, peak: 0.1 }); },
    hit_slime: function (c, d, t) { noise(c, d, t, { dur: 0.16, peak: 0.2, filter: "lowpass", cutoff: 700, cutoffTo: 240, q: 0.6 }); tone(c, d, t, { type: "sine", freq: 180, glideTo: 70, dur: 0.14, peak: 0.12 }); },
    hit_blocked: function (c, d, t) { noise(c, d, t, { dur: 0.1, peak: 0.24, filter: "bandpass", cutoff: 3200, q: 4 }); tone(c, d, t + 0.01, { type: "square", freq: mtof(88), glideTo: mtof(81), dur: 0.12, peak: 0.16 }); },
  };
  // ID別ピッチゆらぎ幅。UI音=0、戦闘音=0.06〜0.10。未指定は既定値(非UI 0.04)。
  var SFX_VAR = {
    hit: 0.08, crit: 0.08, miss: 0.07, fumble: 0.06, allyHit: 0.08, enemyHit: 0.08,
    sword_swing: 0.10, hit_flesh: 0.10, hit_bone: 0.08, hit_slime: 0.10, hit_blocked: 0.06,
    spellDamage: 0.06, enemyDeath: 0.07, bossDeath: 0.05, counter: 0.07, trap: 0.07,
    playerDamage: 0.07, allyDamage: 0.07, coin: 0.05, chestFound: 0, chestOpen: 0.05,
    button: 0, narration: 0,
  };
  var SFX_ALIAS = { levelup: "levelUp" };   // 呼び出し名の表記ゆれ吸収 (index.html に levelup/levelUp 両方あり)

  // ワンショット ジングル (bgm バス経由)
  var JINGLES = {
    victory: function (c, d, t) {
      var notes = [60, 64, 67, 72, 76], sd = 0.12;
      for (var i = 0; i < notes.length; i++) {
        tone(c, d, t + i * sd, { type: "square", freq: mtof(notes[i]), dur: 0.16, peak: 0.18 });
        tone(c, d, t + i * sd, { type: "triangle", freq: mtof(notes[i] - 12), dur: 0.16, peak: 0.1 });
      }
      tone(c, d, t + notes.length * sd, { type: "square", freq: mtof(79), dur: 0.5, peak: 0.2, a: 0.01 });
    },
    defeat: function (c, d, t) {
      var notes = [60, 58, 55, 51], sd = 0.22;
      for (var i = 0; i < notes.length; i++) {
        tone(c, d, t + i * sd, { type: "triangle", freq: mtof(notes[i]), dur: 0.3, peak: 0.18 });
        tone(c, d, t + i * sd, { type: "sine", freq: mtof(notes[i] - 12), dur: 0.3, peak: 0.1 });
      }
    },
  };

  // ===== Section F: BGM スケジューラ + トラック ==============================
  var TRACKS = {
    // 酒場バラード (Em・低速・歪みギターのロングトーン・短3度の哀愁ハモリ・控えめビート)
    tavern: { bpm: 80, stepsPerBeat: 4, leadType: "sawtooth", bassType: "sawtooth", dist: 0.38, power: 1, harmony: 1, makeup: 0.34, leadGain: 0.12, bassGain: 0.13, drumGain: 0.07,
      lead: ["B4","-","-","-","G4","-","-","-","A4","-","-","B4","A4","-","G4","-","E4","-","-","-","G4","-","-","A4","-","-","-","B4","-","-","-","-"],
      bass: ["E1","-","-","-","C2","-","-","-","G1","-","-","-","D2","-","-","-","E1","-","-","-","C2","-","-","-","G1","-","-","-","B1","-","-","-"],
      drum: ["k","-","-","-","-","-","h","-","s","-","-","-","-","-","h","-","k","-","-","-","-","-","h","-","s","-","-","-","h","-","-","-"] },
    // 叙事詩ギャロップ (Am・前進感・単線リードで広がり)
    explore: { bpm: 124, stepsPerBeat: 4, leadType: "sawtooth", bassType: "sawtooth", dist: 0.5, power: 1, harmony: 0, makeup: 0.3, leadGain: 0.12, bassGain: 0.16, drumGain: 0.12,
      lead: ["A4","-","-","E4","-","-","A4","-","C5","-","B4","A4","E4","-","G4","-","A4","-","-","E4","-","-","A4","-","D5","-","C5","B4","A4","-","-","-"],
      bass: ["A1","-","A1","-","A1","-","A1","-","A1","-","A1","-","G1","-","G1","-","F1","-","F1","-","F1","-","F1","-","E1","-","E1","-","E1","-","E1","-"],
      drum: ["k","-","k","h","s","-","k","h","k","-","k","h","s","-","o","-","k","-","k","h","s","-","k","h","k","-","k","h","s","-","s","c"] },
    // 高速パワーメタル (Am疾走・ダブルバスギャロップ・ツインリード)
    combat: { bpm: 168, stepsPerBeat: 4, leadType: "sawtooth", bassType: "sawtooth", dist: 0.62, power: 2, harmony: 1, makeup: 0.24, leadGain: 0.12, bassGain: 0.16, drumGain: 0.13,
      lead: ["A4","-","A4","E4","A4","-","C5","A4","A4","-","A4","E4","F4","-","E4","D4","A4","-","A4","E4","A4","-","C5","A4","E5","-","D5","C5","B4","-","C5","E5"],
      bass: ["A1","A1","A1","A1","A1","A1","A1","A1","A1","A1","A1","A1","A1","A1","A1","A1","F1","F1","F1","F1","F1","F1","F1","F1","E1","E1","E1","E1","E1","E1","E1","E1"],
      drum: ["k","-","k","k","s","-","k","k","k","-","k","k","s","-","k","k","k","-","k","k","s","-","k","k","k","-","k","k","s","k","s","c"] },
    // ダーク&エピック (Dm・重厚・半音上行の不穏・長3度ハモリ)
    boss: { bpm: 144, stepsPerBeat: 4, leadType: "sawtooth", bassType: "sawtooth", dist: 0.66, cabCut: 2800, power: 2, harmony: 2, makeup: 0.22, leadGain: 0.12, bassGain: 0.18, drumGain: 0.14,
      lead: ["D4","-","D4","Eb4","D4","-","Bb3","-","C4","-","C4","Db4","C4","-","A3","-","D4","-","D4","Eb4","F4","-","E4","-","D4","-","C4","Bb3","A3","-","A3","-"],
      bass: ["D1","D1","-","D1","D1","D1","-","D1","D1","D1","-","D1","D1","D1","-","D1","Bb1","Bb1","-","Bb1","Bb1","Bb1","-","Bb1","A1","A1","-","A1","A1","A1","-","A1"],
      drum: ["k","-","-","k","s","-","k","-","k","k","-","k","s","-","s","-","k","-","-","k","s","-","k","-","k","k","k","k","s","k","s","c"] },
    // 重圧ドゥーム (Dm・最重・遅い・半音b9/三全音b5の不穏・最大歪み) — 隠し中ボス専用
    midboss: { bpm: 126, stepsPerBeat: 4, leadType: "sawtooth", bassType: "sawtooth", dist: 0.72, cabCut: 2500, power: 2, harmony: 1, makeup: 0.19, preGain: 1.8, leadGain: 0.12, bassGain: 0.19, drumGain: 0.15,
      lead: ["D4","-","-","-","F4","-","-","-","E4","-","-","-","D4","-","-","-","F4","-","-","-","Ab4","-","-","-","A4","-","G4","-","F4","-","E4","-"],
      bass: ["D1","D1","-","D1","D1","D1","-","D1","Eb1","Eb1","-","Eb1","Eb1","Eb1","-","Eb1","D1","D1","-","D1","D1","D1","-","D1","Ab1","Ab1","-","Ab1","Ab1","Ab1","-","Ab1"],
      drum: ["k","-","-","-","s","-","-","-","k","-","k","-","s","-","-","-","k","-","-","-","s","-","-","-","k","-","k","-","s","-","s","c"] },
    // メタルバラード (Am/C・低速・歪みギターのロングトーン泣き・控えめビート)
    rest: { bpm: 76, stepsPerBeat: 4, leadType: "sawtooth", bassType: "sawtooth", dist: 0.35, power: 1, harmony: 1, makeup: 0.32, leadGain: 0.12, bassGain: 0.12, drumGain: 0.06,
      lead: ["A4","-","-","-","C5","-","-","E5","-","-","-","D5","C5","-","-","-","G4","-","-","-","A4","-","-","C5","-","-","-","B4","A4","-","-","-"],
      bass: ["A1","-","-","-","-","-","-","-","F1","-","-","-","-","-","-","-","C2","-","-","-","-","-","-","-","E1","-","-","-","-","-","-","-"],
      drum: ["k","-","-","-","-","-","h","-","s","-","-","-","-","-","h","-","k","-","-","-","-","-","h","-","s","-","-","-","h","-","h","-"] },
  };

  var LOOKAHEAD = 25, SCHEDULE_AHEAD = 0.12, CROSSFADE = 0.6;
  var bgmState = { name: null, voice: null };
  var crossfading = false, pendingTrack = null, bgmRunning = false;

  // ===== Section F1: ファイルBGM (mp3) レイヤー — シーン連続再生 =============
  //   合成 BGM (上の TRACKS) とは別系統。市販/フリー素材の mp3 を <audio> で
  //   ループ再生し、MediaElementSource 経由で buses.bgm に繋ぐ → 既存の BGM
  //   音量スライダー/ミュート/AudioContext アンロックにそのまま相乗りさせる。
  //   合成 BGM とは相互排他 (playBgm/stopBgm 側で一方を必ず止める)。
  //   入口は playBgm(name) に統合 — 呼び元は ID を渡すだけ。
  var BGM_FILES = {
    dungeon_normal: { src: "assets/bgm/maou_game_dangeon22.mp3",  loop: true, volume: 0.60, credit: "魔王魂" },
    dungeon_climax: { src: "assets/bgm/maou_bgm_orchestra25.mp3", loop: true, volume: 0.60, credit: "魔王魂" },
    pharaxus_stage: { src: "assets/bgm/Ariadne-LastBoss.mp3",     loop: true, volume: 0.55, credit: "ユーフルカ" },
  };
  var bgmEl = null, bgmElNode = null, bgmFileId = null, bgmElSrcId = null;

  function ensureBgmEl() {
    if (typeof Audio !== "function") return null;
    if (!bgmEl) {
      try { bgmEl = new Audio(); bgmEl.loop = true; bgmEl.preload = "auto"; bgmEl.crossOrigin = "anonymous"; }
      catch (e) { bgmEl = null; return null; }
    }
    // MediaElementSource は ctx/buses 準備後に一度だけ接続。失敗時は要素直 volume にフォールバック。
    if (bgmEl && !bgmElNode && ctx && buses) {
      try { bgmElNode = ctx.createMediaElementSource(bgmEl); bgmElNode.connect(buses.bgm); }
      catch (e) { bgmElNode = null; }
    }
    return bgmEl;
  }
  function applyFileBgmVolume() {
    if (!bgmEl) return;
    var def = bgmFileId && BGM_FILES[bgmFileId];
    var tv = def ? def.volume : 1;
    var v;
    if (bgmElNode) {
      v = tv;                                   // master*bgm*mute はバス側で乗算 → 要素は per-track のみ
    } else {
      var s = GameSettings.get();               // フォールバック: バス未接続なら要素 volume に全部合成
      v = (s.muted ? 0 : 1) * s.master * s.bgm * tv;
    }
    try { bgmEl.volume = Math.max(0, Math.min(1, v)); } catch (e) {}
  }
  function stopBgmFile() {
    if (bgmEl) { try { bgmEl.pause(); bgmEl.currentTime = 0; } catch (e) {} }
    bgmFileId = null;
  }
  function playBgmFile(id) {
    var def = BGM_FILES[id]; if (!def) return;
    if (!ensureContext()) { pendingBgm = id; return; }
    if (!unlocked) { pendingBgm = id; return; }
    if (bgmFileId === id && bgmEl && !bgmEl.paused) return;   // dedup: 同曲は途切れさせない (Pharaxus 道中→ボス戦の通し)
    // 合成 BGM が鳴っていれば停止 (相互排他)
    if (bgmState.voice) { stopVoice(bgmState.voice, 0.4); bgmState.voice = null; bgmState.name = null; }
    if (!ensureBgmEl()) return;
    if (bgmElSrcId !== id) { try { bgmEl.src = def.src; } catch (e) {} bgmElSrcId = id; }
    bgmEl.loop = def.loop !== false;
    bgmFileId = id; bgmRunning = true;
    applyFileBgmVolume();
    try { var p = bgmEl.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
  }

  function stepDurOf(tr) { return 60 / tr.bpm / tr.stepsPerBeat; }
  function scheduleStep(vs, when, c) {
    c = c || ctx;                                  // ライブ=ctx / オフライン=oac
    var tr = vs.track, i = vs.stepIndex % tr.loop, sd = stepDurOf(tr);
    var gtr = vs.guitar || vs.gain, drm = vs.gain;   // ギター(歪み経路) / ドラム(素通り)
    var ln = tr.lead && tr.lead[i];
    if (ln && ln !== "-" && ln !== "_") emitChord(c, gtr, when, noteToFreq(ln), tr.leadType, sd * 0.95, tr.leadGain, tr.power, tr.harmony);
    var bn = tr.bass && tr.bass[i];
    if (bn && bn !== "-" && bn !== "_") emitChord(c, gtr, when, noteToFreq(bn), tr.bassType, sd * 1.4, tr.bassGain, tr.bassPower, 0);
    var dn = tr.drum && tr.drum[i];
    if (dn === "k") noise(c, drm, when, { dur: 0.12, peak: tr.drumGain, cutoff: 160, cutoffTo: 60 });
    else if (dn === "h") noise(c, drm, when, { dur: 0.04, peak: tr.drumGain * 0.8, filter: "highpass", cutoff: 7000 });
    else if (dn === "s") noise(c, drm, when, { dur: 0.12, peak: tr.drumGain, filter: "bandpass", cutoff: 1800, q: 1 });
    else if (dn === "o") noise(c, drm, when, { dur: 0.14, peak: tr.drumGain * 0.7, filter: "highpass", cutoff: 6000 });   // open hat
    else if (dn === "c") noise(c, drm, when, { dur: 0.5, peak: tr.drumGain * 0.9, filter: "highpass", cutoff: 5000, a: 0.001 }); // crash
  }
  function pump(vs) {
    if (!ctx) return;
    var sd = stepDurOf(vs.track);
    if (ctx.currentTime - vs.nextTime > 1.0) vs.nextTime = ctx.currentTime + 0.05;
    while (vs.nextTime < ctx.currentTime + SCHEDULE_AHEAD) {
      scheduleStep(vs, vs.nextTime); vs.stepIndex++; vs.nextTime += sd;
    }
  }
  // 歪みチェーン構築 (ライブ ctx / オフライン oac 共用)。dest=vg(クロスフェード段)。
  // 戻り値=ギター系 tone の出力先 (歪みON なら shaperIn、OFF なら vg 直結)。
  function buildGuitarChain(c, tr, vg) {
    if (!(tr.dist && tr.dist > 0)) return vg;
    var shaperIn = c.createGain(); shaperIn.gain.value = (tr.preGain == null ? 1.6 : tr.preGain);
    var shaper = c.createWaveShaper(); shaper.curve = makeDistortionCurve(tr.dist);
    try { shaper.oversample = "4x"; } catch (e) {}
    var cab = c.createBiquadFilter(); cab.type = "lowpass";
    cab.frequency.value = (tr.cabCut == null ? 3200 : tr.cabCut); cab.Q.value = 0.7;
    var makeup = c.createGain(); makeup.gain.value = (tr.makeup == null ? 0.6 : tr.makeup);
    shaperIn.connect(shaper); shaper.connect(cab); cab.connect(makeup); makeup.connect(vg);
    return shaperIn;
  }
  function startVoice(name) {
    var tr = TRACKS[name]; if (!tr) return null;
    tr.loop = (tr.lead && tr.lead.length) || 16;
    var vg = ctx.createGain(); vg.gain.value = 0; vg.connect(buses.bgm);
    var vs = { track: tr, gain: vg, guitar: buildGuitarChain(ctx, tr, vg), stepIndex: 0, nextTime: ctx.currentTime + 0.06, timer: null, name: name };
    vs.timer = setInterval(function () { pump(vs); }, LOOKAHEAD);
    pump(vs);
    return vs;
  }
  function stopVoice(vs, fade) {
    if (!vs) return;
    if (vs.timer) { clearInterval(vs.timer); vs.timer = null; }
    var f = (fade || 0.3);
    try { vs.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, f * 0.4); } catch (e) {}
    setTimeout(function () { try { vs.gain.disconnect(); } catch (e) {} }, (f + 0.3) * 1000);
  }
  function playBgm(name) {
    if (!ensureContext()) { pendingBgm = name; return; }
    if (!unlocked) { pendingBgm = name; return; }
    if (BGM_FILES[name]) { playBgmFile(name); return; }       // ファイルBGM(mp3)は別レイヤーへ
    if (!TRACKS[name]) return;
    if (bgmFileId) stopBgmFile();                             // 合成 BGM へ移る時はファイルBGMを停止 (相互排他)
    if (bgmState.name === name && bgmState.voice) return;     // dedup: 同トラックは再起動しない
    if (crossfading) { pendingTrack = name; return; }
    var old = bgmState.voice;
    var nv = startVoice(name); if (!nv) return;
    bgmState.voice = nv; bgmState.name = name; bgmRunning = true;
    try { nv.gain.gain.setTargetAtTime(1.0, ctx.currentTime, CROSSFADE * 0.4); } catch (e) { try { nv.gain.gain.value = 1; } catch (e2) {} }
    if (old) {
      crossfading = true;
      stopVoice(old, CROSSFADE);
      setTimeout(function () {
        crossfading = false;
        if (pendingTrack && pendingTrack !== bgmState.name) { var p = pendingTrack; pendingTrack = null; playBgm(p); }
        else pendingTrack = null;
      }, CROSSFADE * 1000 + 50);
    }
  }
  function stopBgm() {
    stopBgmFile();                                            // ファイルBGM(mp3)も停止 (結果画面の stopBgm→jingle 経路を流用)
    if (bgmState.voice) stopVoice(bgmState.voice, 0.4);
    bgmState.voice = null; bgmState.name = null; bgmRunning = false; pendingTrack = null;
  }

  // ===== Section F2: ナレーション・ボイス (事前生成 mp3 の再生) ==============
  //   VOICEVOX で事前生成した mp3 を fetch→decode→buses.voice で再生。
  //   manifest 未ロード/未生成/file:///未 unlock では全 API が無音 no-op。
  //   ※ 上の BGM 内部関数 stopVoice(vs) とは別物 (playVoiceClip/stopVoiceClip)。
  var voiceManifest = null;   // id -> { category, file, text, speaker, durationSec, hash }
  var voiceBaseDir = "";       // manifest の file に前置するパス (例 "assets/voice/")
  var voiceBufCache = {};      // id -> AudioBuffer (decode 済キャッシュ)
  var voiceFetching = {};      // id -> true (多重 fetch 抑止)
  var currentVoiceSrc = null;  // 再生中の BufferSource (新ナレ開始時に停止)

  function loadVoiceManifest(url, baseDir) {
    if (typeof fetch !== "function" || !url) return;
    voiceBaseDir = baseDir || "";
    try {
      fetch(url)
        .then(function (r) { return (r && r.ok) ? r.json() : null; })
        .then(function (j) { if (j && typeof j === "object") voiceManifest = j; })
        .catch(function () {});   // file:// や未生成は握り潰し → ボイス無効のまま続行
    } catch (e) {}
  }

  function stopVoiceClip() {
    if (currentVoiceSrc) {
      try { currentVoiceSrc.stop(); } catch (e) {}
      try { currentVoiceSrc.disconnect(); } catch (e2) {}
      currentVoiceSrc = null;
    }
  }

  function startVoiceBuffer(buf) {
    if (!buf || !ensureContext() || !buses) return;
    stopVoiceClip();
    try {
      var src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(buses.voice);
      src.onended = function () { if (currentVoiceSrc === src) { currentVoiceSrc = null; unduck(); } };
      src.start(0);
      currentVoiceSrc = src;
      duckForVoice();                 // 発話中は SFX/UI を控えめに (整音感)
    } catch (e) {}
  }

  function playVoiceClip(id) {
    if (!id || !voiceManifest) return;
    if (!ensureContext() || !unlocked) return;
    var entry = voiceManifest[id];
    if (!entry || !entry.file) return;
    if (voiceBufCache[id]) { startVoiceBuffer(voiceBufCache[id]); return; }
    if (voiceFetching[id] || typeof fetch !== "function") return;
    voiceFetching[id] = true;
    var url = voiceBaseDir + entry.file;
    try {
      fetch(url)
        .then(function (r) { if (!r || !r.ok) throw new Error("voice 404: " + url); return r.arrayBuffer(); })
        .then(function (ab) { return ctx.decodeAudioData(ab); })
        .then(function (buf) { voiceBufCache[id] = buf; voiceFetching[id] = false; startVoiceBuffer(buf); })
        .catch(function () { voiceFetching[id] = false; });
    } catch (e) { voiceFetching[id] = false; }
  }

  // 指定 id 群を事前に fetch+decode して voiceBufCache に載せる (再生遅延ゼロ化)。
  // 成功/失敗どちらでも resolve するので呼び元は固まらない。decode は suspended でも可。
  function preloadVoiceClips(ids) {
    if (!ids || !ids.length || !voiceManifest || !ensureContext() || typeof fetch !== "function") {
      return Promise.resolve();
    }
    return Promise.all(ids.map(function (id) {
      return new Promise(function (resolve) {
        if (!id || voiceBufCache[id]) return resolve();
        var entry = voiceManifest[id];
        if (!entry || !entry.file) return resolve();
        if (voiceFetching[id]) return resolve();   // playVoiceClip と多重 fetch 抑止を共有
        voiceFetching[id] = true;
        try {
          fetch(voiceBaseDir + entry.file)
            .then(function (r) { if (!r || !r.ok) throw new Error("voice 404"); return r.arrayBuffer(); })
            .then(function (ab) { return ctx.decodeAudioData(ab); })
            .then(function (buf) { voiceBufCache[id] = buf; voiceFetching[id] = false; resolve(); })
            .catch(function () { voiceFetching[id] = false; resolve(); });
        } catch (e) { voiceFetching[id] = false; resolve(); }
      });
    })).then(function () {});
  }

  // クリップ尺(秒)。ミュート/音量0 のときは 0 を返し、呼び元をテキストペースへ落とす。
  // decode 済なら正確な buffer.duration、未 decode なら manifest の durationSec を返す。
  function getVoiceDuration(id) {
    if (!id) return 0;
    try {
      var s = GameSettings.get();
      if (s.muted || s.voice === 0) return 0;
    } catch (e) {}
    if (voiceBufCache[id] && typeof voiceBufCache[id].duration === "number") return voiceBufCache[id].duration;
    var entry = voiceManifest && voiceManifest[id];
    return (entry && typeof entry.durationSec === "number") ? entry.durationSec : 0;
  }

  // ===== Section F2: ファイルSFX (サンプル素材。manifest 未生成時は合成へフォールバック) =====
  //   voice 実装をミラー。assets/sfx/sfx-manifest.json が無ければ全 API が合成音にフォールバック。
  var sfxManifest = null;      // id -> { files:[rel...], volume, pitchVar, bus, loop, loopStart, loopEndOffset, flicker, preload }
  var sfxBaseDir = "";
  var sfxBufCache = {};        // (baseDir+file) -> AudioBuffer
  var sfxFetching = {};        // (baseDir+file) -> true (多重 fetch 抑止)
  var sfxLoops = {};           // id -> { src, gain, base, timer } (再生中ループ)

  function loadSfxManifest(url, baseDir) {
    if (typeof fetch !== "function" || !url) return;
    sfxBaseDir = baseDir || "";
    try {
      fetch(url)
        .then(function (r) { return (r && r.ok) ? r.json() : null; })
        .then(function (j) { if (j && typeof j === "object") { sfxManifest = j; eagerPreloadSfx(); } })
        .catch(function () {});   // 未生成/file:// は握り潰し → 合成音のまま続行
    } catch (e) {}
  }
  function sfxFetchBuf(file) {   // decode 済 buffer を resolve (失敗/未 unlock は null)
    var url = sfxBaseDir + file;
    if (sfxBufCache[url]) return Promise.resolve(sfxBufCache[url]);
    if (typeof fetch !== "function" || !ensureContext()) return Promise.resolve(null);
    if (sfxFetching[url]) return Promise.resolve(null);
    sfxFetching[url] = true;
    return fetch(url)
      .then(function (r) { if (!r || !r.ok) throw new Error("sfx 404: " + url); return r.arrayBuffer(); })
      .then(function (ab) { return ctx.decodeAudioData(ab); })
      .then(function (buf) { sfxBufCache[url] = buf; sfxFetching[url] = false; return buf; })
      .catch(function () { sfxFetching[url] = false; return null; });
  }
  function eagerPreloadSfx() {
    if (!sfxManifest) return;
    for (var id in sfxManifest) {
      var def = sfxManifest[id];
      if (def && def.preload === "eager" && def.files) for (var i = 0; i < def.files.length; i++) sfxFetchBuf(def.files[i]);
    }
  }
  function preloadSfx(ids) {
    if (!sfxManifest || !ids || !ids.length) return Promise.resolve();
    var jobs = [];
    for (var i = 0; i < ids.length; i++) {
      var def = sfxManifest[ids[i]];
      if (def && def.files) for (var j = 0; j < def.files.length; j++) jobs.push(sfxFetchBuf(def.files[j]));
    }
    return Promise.all(jobs).then(function () {});
  }
  // サンプル素材で1発再生。未ロード/未存在/ループ定義は false を返し、呼び元が合成へ落ちる。
  function playSampled(name, opts) {
    if (!sfxManifest || !buses) return false;
    var def = sfxManifest[name];
    if (!def || !def.files || !def.files.length || def.loop) return false;
    var file = def.files[(Math.random() * def.files.length) | 0];
    var buf = sfxBufCache[sfxBaseDir + file];
    if (!buf) { sfxFetchBuf(file); return false; }   // 初回は fetch だけ→今回は合成へ(遅延ゼロ)。次回からサンプル
    try {
      var src = ctx.createBufferSource(); src.buffer = buf;
      var pv = (def.pitchVar != null) ? def.pitchVar : 0;
      src.playbackRate.value = 1 + (Math.random() * 2 - 1) * pv;
      var g = ctx.createGain();
      g.gain.value = (def.volume != null ? def.volume : 1) * (1 + (Math.random() * 2 - 1) * 0.08);
      var route = (def.bus === "ui" || name === "button" || name === "narration") ? buses.ui : buses.sfx;
      src.connect(g); g.connect(route);
      src.onended = function () { try { src.disconnect(); g.disconnect(); } catch (e) {} };
      src.start(0);
    } catch (e) { return false; }
    return true;
  }
  function playLoop(name) {       // 火/環境音などのシームレスループ (B-4)
    if (!sfxManifest || !ensureContext() || !unlocked || !buses) return;
    var def = sfxManifest[name];
    if (!def || !def.files || !def.files.length || !def.loop || sfxLoops[name]) return;
    sfxLoops[name] = { pending: true };   // 二重起動防止
    sfxFetchBuf(def.files[0]).then(function (buf) {
      if (!buf || !sfxLoops[name]) { delete sfxLoops[name]; return; }
      try {
        var src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
        if (def.loopStart != null) src.loopStart = def.loopStart;
        src.loopEnd = buf.duration - (def.loopEndOffset != null ? def.loopEndOffset : 0);
        var g = ctx.createGain(); var base = (def.volume != null ? def.volume : 0.6);
        g.gain.value = 0.0001; g.connect(buses.sfx); src.connect(g); src.start(0);
        g.gain.linearRampToValueAtTime(base, ctx.currentTime + 0.6);   // フェードイン
        var rec = { src: src, gain: g, base: base, timer: null };
        if (def.flicker) {                                              // メラメラ感 (gainをゆっくり揺らす)
          var f = def.flicker, lo = (f.min != null ? f.min : 0.7), hi = (f.max != null ? f.max : 1.0), per = (f.period != null ? f.period : 2.5);
          rec.timer = setInterval(function () {
            try { g.gain.setTargetAtTime(base * (lo + Math.random() * (hi - lo)), ctx.currentTime, per * 0.4); } catch (e) {}
          }, per * 1000);
        }
        sfxLoops[name] = rec;
      } catch (e) { delete sfxLoops[name]; }
    });
  }
  function stopLoop(name) {
    var L = sfxLoops[name]; if (!L) return;
    delete sfxLoops[name];
    if (L.pending) return;
    try { if (L.timer) clearInterval(L.timer); } catch (e) {}
    try { L.gain.gain.cancelScheduledValues(ctx.currentTime); L.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15); } catch (e) {}
    var s = L.src; setTimeout(function () { try { s.stop(); s.disconnect(); } catch (e) {} }, 500);
  }

  // ===== Section G: Public API ==============================================
  // サンプル素材があれば優先、無ければ合成 recipe を再生ごとゆらぎ付きで発音。
  function playSfx(name, opts) {
    if (!ensureContext() || !unlocked) return;
    opts = opts || {};
    if (playSampled(name, opts)) return;                       // サンプル素材があれば優先
    var recipe = SFX[name] || SFX[SFX_ALIAS[name]]; if (!recipe) return;
    var isUi = (name === "button" || name === "narration");
    var route = isUi ? buses.ui : buses.sfx;
    var pv = (SFX_VAR[name] != null) ? SFX_VAR[name] : (isUi ? 0 : 0.04);
    var pp = _sfxPitch, pg = _sfxGain;
    _sfxPitch = 1 + (Math.random() * 2 - 1) * pv;              // ピッチ ±pv
    _sfxGain = isUi ? 1 : (1 + (Math.random() * 2 - 1) * 0.08); // 音量 ±8% (UIは固定)
    try { recipe(ctx, route, ctx.currentTime, opts); } catch (e) {}
    _sfxPitch = pp; _sfxGain = pg;
  }
  // 時間差レイヤリング (例: スイング→ヒットの2層)。steps = [{id, delay(秒), opts}]
  function playLayered(steps) {
    if (!steps || !steps.length) return;
    for (var i = 0; i < steps.length; i++) {
      (function (s) {
        if (!s || !s.id) return;
        var dly = s.delay || 0;
        if (dly <= 0) playSfx(s.id, s.opts);
        else setTimeout(function () { playSfx(s.id, s.opts); }, dly * 1000);
      })(steps[i]);
    }
  }
  function playJingle(name) {
    if (!ensureContext() || !unlocked) return;
    var j = JINGLES[name]; if (!j) return;
    stopBgm();
    try { j(ctx, buses.bgm, ctx.currentTime); } catch (e) {}
  }

  // ===== Section H: offline テストフック =====================================
  function renderOffline(name, opts, seconds) {
    var OAC = global.OfflineAudioContext || global.webkitOfflineAudioContext;
    if (!OAC) return Promise.reject(new Error("no OfflineAudioContext"));
    var recipe = SFX[name] || SFX[SFX_ALIAS[name]] || JINGLES[name];
    if (!recipe) return Promise.reject(new Error("unknown sound: " + name));
    opts = opts || {};
    var sr = 44100, sec = seconds || 1.2;
    var oac = new OAC(1, Math.ceil(sr * sec), sr);
    var g = oac.createGain(); g.gain.value = 1; g.connect(oac.destination);
    var pp = _sfxPitch, pg = _sfxGain;                          // opts.pitch/opts.gain でゆらぎを再現可能に(検証用)
    if (opts.pitch != null) _sfxPitch = opts.pitch;
    if (opts.gain != null) _sfxGain = opts.gain;
    try { recipe(oac, g, 0, opts); } catch (e) { _sfxPitch = pp; _sfxGain = pg; return Promise.reject(e); }
    _sfxPitch = pp; _sfxGain = pg;
    return oac.startRendering().then(function (buf) { return buf.getChannelData(0); });
  }
  // BGM トラックをオフラインレンダー (メタル歪み検証用)。opts.dist で歪み量を上書き可 (ON/OFF 比較)。
  function renderBgmOffline(name, seconds, opts) {
    var OAC = global.OfflineAudioContext || global.webkitOfflineAudioContext;
    if (!OAC) return Promise.reject(new Error("no OfflineAudioContext"));
    var tr = TRACKS[name]; if (!tr) return Promise.reject(new Error("unknown track: " + name));
    opts = opts || {};
    if (opts.dist != null) { var o = {}; for (var k in tr) o[k] = tr[k]; o.dist = opts.dist; tr = o; } // 非破壊オーバーライド
    tr.loop = (tr.lead && tr.lead.length) || 16;
    var sr = 44100, sec = seconds || 4.0;
    var oac = new OAC(1, Math.ceil(sr * sec), sr);
    var out = oac.createGain(); out.gain.value = 1.0; out.connect(oac.destination);
    var vs = { track: tr, gain: out, guitar: buildGuitarChain(oac, tr, out), stepIndex: 0 };
    var sd = 60 / tr.bpm / tr.stepsPerBeat;
    var n = Math.ceil(sec / sd) + 1;
    for (var s = 0; s < n; s++) { scheduleStep(vs, s * sd, oac); vs.stepIndex++; }
    return oac.startRendering().then(function (buf) { return buf.getChannelData(0); });
  }

  // ===== Section I: 設定メニュー UI (両ページ共通・self-contained) ===========
  var _settingsEl = null;
  function btnCss() { return "font-family:inherit;background:#7a5a2a;color:#f3e6c8;border:1px solid #8b6914;border-radius:4px;padding:8px 16px;font-size:14px;cursor:pointer;"; }
  function rowEl(labelText, control) {
    var r = document.createElement("div");
    r.style.cssText = "display:flex;align-items:center;gap:12px;margin:10px 0;";
    var l = document.createElement("div");
    l.textContent = labelText; l.style.cssText = "font-size:14px;color:#5a4516;min-width:104px;";
    r.appendChild(l); r.appendChild(control); return r;
  }
  function volRow(label, getv, setv) {
    var valEl = document.createElement("span"); valEl.style.cssText = "min-width:38px;text-align:right;font-size:13px;color:#5a4516;";
    function upd(v) { valEl.textContent = Math.round(v * 100) + "%"; }
    var sl = document.createElement("input");
    sl.type = "range"; sl.min = "0"; sl.max = "100"; sl.value = String(Math.round(getv() * 100));
    sl.style.cssText = "flex:1;cursor:pointer;";
    sl.addEventListener("input", function () { var v = (+sl.value) / 100; setv(v); upd(v); });
    upd(getv());
    var wrap = document.createElement("div"); wrap.style.cssText = "display:flex;flex:1;align-items:center;gap:8px;";
    wrap.appendChild(sl); wrap.appendChild(valEl);
    return rowEl(label, wrap);
  }
  function closeSettings() {
    if (_settingsEl && _settingsEl.parentNode) _settingsEl.parentNode.removeChild(_settingsEl);
    _settingsEl = null;
  }
  function openSettings() {
    unlock();
    if (_settingsEl) { closeSettings(); return; }
    if (typeof document === "undefined") return;
    var s = GameSettings.get();
    var ov = document.createElement("div");
    ov.id = "gameSettingsOverlay";
    ov.style.cssText = "position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(4,6,10,0.72);";
    ov.addEventListener("click", function (e) { if (e.target === ov) closeSettings(); });
    var box = document.createElement("div");
    box.style.cssText = "width:min(420px,92vw);background:linear-gradient(135deg,#f1e2bb,#e9d49a 55%,#d8bc7e);color:#3a2a12;border:3px double #8b6914;border-radius:6px;box-shadow:0 0 28px rgba(0,0,0,0.85);padding:18px 22px;font-family:'MedievalSharp','Cinzel',serif;";
    box.addEventListener("click", function (e) { e.stopPropagation(); });
    var h = document.createElement("div");
    h.textContent = "⚙ 設定";
    h.style.cssText = "font-size:20px;font-weight:bold;color:#7a5a14;text-align:center;border-bottom:1px solid rgba(139,105,20,0.4);padding-bottom:8px;margin-bottom:12px;";
    box.appendChild(h);
    box.appendChild(volRow("マスター音量", function () { return GameSettings.get().master; }, function (v) { GameAudio.setMasterVolume(v); }));
    box.appendChild(volRow("BGM 音量", function () { return GameSettings.get().bgm; }, function (v) { GameAudio.setBgmVolume(v); }));
    box.appendChild(volRow("効果音 音量", function () { return GameSettings.get().sfx; }, function (v) { GameAudio.setSfxVolume(v); }));
    box.appendChild(volRow("ボイス音量", function () { return GameSettings.get().voice; }, function (v) { GameAudio.setVoiceVolume(v); }));
    // ミュート
    var mk = document.createElement("label"); mk.style.cssText = "display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px;";
    var cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = !!s.muted;
    cb.addEventListener("change", function () { GameAudio.setMute(cb.checked); });
    var mt = document.createElement("span"); mt.textContent = "ミュート";
    mk.appendChild(cb); mk.appendChild(mt);
    box.appendChild(rowEl("音を消す", mk));
    // 文字送り速度 (右=速=低ms)。0..100 ↔ ms 120..10
    var tsVal = document.createElement("span"); tsVal.style.cssText = "min-width:54px;text-align:right;font-size:12px;color:#5a4516;";
    function msToPct(ms) { return Math.round((120 - ms) / 110 * 100); }
    function pctToMs(p) { return Math.max(0, Math.round(120 - p / 100 * 110)); }
    function tsupd(ms) { tsVal.textContent = ms <= 10 ? "最速" : (ms + "ms"); }
    var ts = document.createElement("input"); ts.type = "range"; ts.min = "0"; ts.max = "100";
    ts.value = String(msToPct(s.textSpeed)); ts.style.cssText = "flex:1;cursor:pointer;";
    ts.addEventListener("input", function () { var ms = pctToMs(+ts.value); GameSettings.patch({ textSpeed: ms }); GameAudio.applySettings(); tsupd(ms); });
    tsupd(s.textSpeed);
    var tswrap = document.createElement("div"); tswrap.style.cssText = "display:flex;flex:1;align-items:center;gap:8px;";
    tswrap.appendChild(ts); tswrap.appendChild(tsVal);
    box.appendChild(rowEl("文字送り速度", tswrap));
    // ボタン
    var bar = document.createElement("div"); bar.style.cssText = "display:flex;gap:10px;justify-content:space-between;margin-top:16px;";
    var test = document.createElement("button"); test.textContent = "試聴 ▶"; test.style.cssText = btnCss();
    test.addEventListener("click", function () { unlock(); playSfx("heal"); });
    var closeB = document.createElement("button"); closeB.textContent = "閉じる"; closeB.style.cssText = btnCss();
    closeB.addEventListener("click", closeSettings);
    bar.appendChild(test); bar.appendChild(closeB);
    box.appendChild(bar);
    // クレジット表記 (VOICEVOX 利用規約: キャラクター名のクレジット表示が必須)
    var cred = document.createElement("div");
    cred.textContent = "ナレーション音声  VOICEVOX:青山龍星 / 玄野武宏 / 剣崎雌雄 / 九州そら / 麒ヶ島宗麟　｜　BGM  魔王魂 / ユーフルカ";
    cred.style.cssText = "margin-top:14px;padding-top:8px;border-top:1px solid rgba(139,105,20,0.3);font-size:11px;color:#6a5418;text-align:center;letter-spacing:0.02em;";
    box.appendChild(cred);
    ov.appendChild(box);
    (document.body || document.documentElement).appendChild(ov);
    _settingsEl = ov;
    var esc = function (e) { if (e.key === "Escape") { closeSettings(); document.removeEventListener("keydown", esc, true); } };
    document.addEventListener("keydown", esc, true);
  }

  var GameAudio = {
    unlock: unlock,
    playSfx: playSfx,
    play: playSfx,                 // playSfx のエイリアス (spec の play(id) 命名)
    playLayered: playLayered,      // 時間差レイヤリング ([{id,delay}])
    playLoop: playLoop,            // ループ音 (火/環境音)
    stopLoop: stopLoop,
    loadSfxManifest: loadSfxManifest,
    preloadSfx: preloadSfx,
    playBgm: playBgm,
    stopBgm: stopBgm,
    playJingle: playJingle,
    setMasterVolume: function (v) { GameSettings.patch({ master: v }); applyVolumes(); },
    setBgmVolume: function (v) { GameSettings.patch({ bgm: v }); applyVolumes(); },
    setSfxVolume: function (v) { GameSettings.patch({ sfx: v }); applyVolumes(); },
    setVoiceVolume: function (v) { GameSettings.patch({ voice: v }); applyVolumes(); },
    setMute: function (b) { GameSettings.patch({ muted: !!b }); applyVolumes(); },
    playVoice: playVoiceClip,
    stopVoice: stopVoiceClip,
    preloadVoice: preloadVoiceClips,
    getVoiceDuration: getVoiceDuration,
    loadVoiceManifest: loadVoiceManifest,
    applySettings: function () { GameSettings.reload(); if (buses) applyVolumes(); GameAudio.textSpeed = GameSettings.get().textSpeed; },
    openSettings: openSettings,
    closeSettings: closeSettings,
    isReady: function () { return !!(supported && ctx && unlocked); },
    isSupported: function () { return supported; },
    sfxNames: function () { var a = []; for (var k in SFX) a.push(k); return a; },
    textSpeed: GameSettings.get().textSpeed,
    __renderSfxOffline: renderOffline,
    __renderBgmOffline: renderBgmOffline,
    __bgmRunning: function () { return bgmRunning; },
    __bgmFileState: function () { return { id: bgmFileId, srcId: bgmElSrcId, hasEl: !!bgmEl, paused: bgmEl ? bgmEl.paused : null, node: !!bgmElNode }; },
    __bgmFileIds: function () { var a = []; for (var k in BGM_FILES) a.push(k); return a; },
    __duckLevel: function () { return _duckLevel; },                 // 検証: 現在の duck 目標値
    __voiceDuckTest: function () { duckForVoice(); return _duckLevel; },  // startVoiceBuffer が呼ぶ duck 経路
    __voiceUnduckTest: function () { unduck(); return _duckLevel; },      // voice onended が呼ぶ unduck 経路
    __sfxManifestLoaded: function () { return !!sfxManifest; },       // 検証: サンプル manifest ロード済か
    __sfxNames: function () { var a = []; for (var k in SFX) a.push(k); return a; },
  };

  global.GameSettings = GameSettings;
  global.GameAudio = GameAudio;
})(typeof window !== "undefined" ? window : this);
