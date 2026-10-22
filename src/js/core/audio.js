/* ============================================================================
 * audio.js
 * 音效与震动：WebAudio 实时合成，无音频文件。
 * ========================================================================== */

import { settings } from './state.js';

/* ==========================================================
   音效：WebAudio 实时合成
   ========================================================== */
export var audio = {
  ctx: null,
  master: null,
  noiseBuf: null,
  ready: false,

  init: function () {
    try {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        this.ready = true;
        return;
      }
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.ready = true;
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.2;
      this.master.connect(this.ctx.destination);

      var len = Math.floor(this.ctx.sampleRate * 0.35);
      var buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    } catch (e) {
      this.ctx = null;
    }
  },

  tone: function (type, f0, f1, dur, delay, gain) {
    var ctx = this.ctx;
    if (!ctx) return;
    var t0 = ctx.currentTime + (delay || 0);
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, f0), t0);
    if (f1 && f1 !== f0) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    }
    var peak = gain === undefined ? 0.5 : gain;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  },

  noise: function (dur, freq, q, delay, gain) {
    var ctx = this.ctx;
    if (!ctx || !this.noiseBuf) return;
    var t0 = ctx.currentTime + (delay || 0);
    var src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(freq || 1000, t0);
    bp.Q.value = q || 1.1;
    var g = ctx.createGain();
    g.gain.setValueAtTime(gain === undefined ? 0.5 : gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }
};

export function buzz(pattern) {
  if (!settings.haptics) return;
  if (navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch (e) { /* 忽略 */ }
  }
}

export function sfx(name, detail) {
  if (!settings.sound || !audio.ready) return;
  if (!audio.ctx) return;

  switch (name) {
    case 'x':
      audio.tone('square', 590, 470, 0.045, 0, 0.22);
      break;
    case 'xOff':
      audio.tone('sine', 330, 240, 0.07, 0, 0.35);
      break;
    case 'queen':
      audio.noise(0.07, 900, 1.3, 0, 0.55);
      audio.tone('sine', 210, 148, 0.14, 0, 0.55);
      audio.tone('triangle', 1046, 1046, 0.06, 0.03, 0.16);
      break;
    case 'remove':
      audio.tone('sine', 300, 190, 0.09, 0, 0.4);
      break;
    case 'auto':
      audio.tone('sine', 1250, 1320, 0.025, 0, 0.1);
      break;
    case 'conflict':
      audio.tone('sawtooth', 132, 126, 0.2, 0, 0.22);
      audio.tone('sawtooth', 139, 132, 0.2, 0.01, 0.18);
      break;
    case 'region':
      audio.tone('triangle', 784, 784, 0.08, 0, 0.3);
      audio.tone('triangle', 988, 988, 0.11, 0.075, 0.26);
      break;
    case 'hint':
      audio.tone('sine', 620, 1240, 0.18, 0, 0.28);
      break;
    case 'share':
      audio.tone('triangle', 880, 880, 0.055, 0, 0.2);
      audio.tone('triangle', 1174, 1174, 0.085, 0.055, 0.16);
      break;
    case 'undo':
      audio.tone('sine', 430, 300, 0.09, 0, 0.3);
      break;
    case 'new':
      audio.noise(0.2, 600, 0.7, 0, 0.22);
      audio.tone('sine', 300, 520, 0.2, 0, 0.18);
      break;
    case 'win':
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach(function (f, i) {
        audio.tone('triangle', f, f, 0.16, i * 0.1, 0.32);
      });
      audio.noise(0.5, 4200, 0.8, 0.1, 0.1);
      break;
    default:
      break;
  }
}
