/* ──────────────────────────────────────────────
   sounds.js — Web Audio API sound effects
   ────────────────────────────────────────────── */
(function () {
  "use strict";

  let _ctx = null;
  function ctx() {
    if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (_ctx.state === "suspended") _ctx.resume();
    return _ctx;
  }

  function enabled() {
    try { return localStorage.getItem("center_sounds_off") !== "1"; }
    catch { return true; }
  }

  function playTone(freq, duration, type, vol, detune) {
    if (!enabled()) return;
    const c = ctx();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || "sine";
    o.frequency.value = freq;
    if (detune) o.detune.value = detune;
    g.gain.setValueAtTime(vol || 0.15, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    o.connect(g).connect(c.destination);
    o.start(c.currentTime);
    o.stop(c.currentTime + duration);
  }

  function playSequence(notes) {
    if (!enabled()) return;
    const c = ctx();
    let t = c.currentTime;
    notes.forEach(([freq, dur, type, vol]) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type || "sine";
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + dur);
      t += dur * 0.7;
    });
  }

  /* ─── Sound library ─── */

  // Cash register — two quick ascending metallic chings
  function cashRegister() {
    playSequence([
      [1200, 0.08, "square", 0.07],
      [1800, 0.12, "sine", 0.10],
      [2400, 0.15, "sine", 0.08],
    ]);
  }

  // Coin drop — high ping then lower thud
  function coinDrop() {
    playSequence([
      [2200, 0.06, "sine", 0.12],
      [1400, 0.10, "triangle", 0.08],
      [900, 0.08, "sine", 0.05],
    ]);
  }

  // Success chime — warm two-note ascending
  function success() {
    playSequence([
      [660, 0.15, "sine", 0.12],
      [880, 0.25, "sine", 0.10],
    ]);
  }

  // Message sent — quick swoosh (freq sweep up)
  function messageSent() {
    if (!enabled()) return;
    const c = ctx();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(400, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(1200, c.currentTime + 0.12);
    g.gain.setValueAtTime(0.10, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.2);
    o.connect(g).connect(c.destination);
    o.start(c.currentTime);
    o.stop(c.currentTime + 0.2);
  }

  // Save — short confirmation beep
  function save() {
    playSequence([
      [800, 0.08, "sine", 0.10],
      [1000, 0.15, "sine", 0.08],
    ]);
  }

  // Delete — low warning double-beep
  function del() {
    playSequence([
      [300, 0.10, "square", 0.06],
      [250, 0.15, "square", 0.05],
    ]);
  }

  // Warning — single low tone
  function warning() {
    playTone(350, 0.25, "sawtooth", 0.06);
  }

  // Export — quick ascending triple
  function exp() {
    playSequence([
      [600, 0.06, "sine", 0.08],
      [800, 0.06, "sine", 0.08],
      [1000, 0.10, "sine", 0.08],
    ]);
  }

  // Student added — short happy ascending "ding-ding"
  function studentAdded() {
    playSequence([
      [880, 0.08, "sine", 0.10],
      [1320, 0.12, "sine", 0.09],
    ]);
  }

  // Incomplete data alert — two quick beeps
  function incompleteAlert() {
    playSequence([
      [660, 0.10, "triangle", 0.08],
      [880, 0.10, "triangle", 0.07],
    ]);
  }

  // Urgent alarm — annoying repeating tone for ST-CALL/ST-EXPEL
  function urgentAlarm() {
    if (!enabled()) return;
    const c = ctx();
    [0, 0.25, 0.5, 0.75].forEach((offset) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "square";
      o.frequency.value = 440;
      g.gain.setValueAtTime(0.12, c.currentTime + offset);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + offset + 0.15);
      o.connect(g).connect(c.destination);
      o.start(c.currentTime + offset);
      o.stop(c.currentTime + offset + 0.15);
    });
  }

  /* ─── Public API ─── */
  window.Sounds = {
    cashRegister,
    coinDrop,
    success,
    messageSent,
    save,
    delete: del,
    warning,
    export: exp,
    studentAdded,
    incompleteAlert,
    urgentAlarm,
    enabled,
    toggle() {
      const off = localStorage.getItem("center_sounds_off") === "1";
      localStorage.setItem("center_sounds_off", off ? "0" : "1");
      return !off;
    },
  };
})();
