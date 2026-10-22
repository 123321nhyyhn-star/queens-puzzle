/* ============================================================================
 * win.js
 * 胜利判定、礼花、通关结果层。
 * ========================================================================== */

import { buzz, sfx } from '../core/audio.js';
import { stopTimer } from '../core/clock.js';
import { REDUCE_MOTION } from '../core/config.js';
import { boardEl, btnAgain, fxEl, resHints, resSize, resTime, resultEl, resultSub } from '../core/dom.js';
import { guide, state, view } from '../core/state.js';
import { save } from '../core/storage.js';
import { announce, formatTime } from '../core/utils.js';
import { queenCount, regionCounts } from '../game/rules.js';
import { closeGuide } from './guide.js';
import { updateHint } from './hint.js';
import { updateStats } from './render.js';

/* ==========================================================
   胜利
   ========================================================== */
export function checkWin() {
  if (state.status !== 'playing') return;
  var n = state.size;
  var counts = state.regionCounts || regionCounts();
  if (queenCount() !== n) return;
  if (state.conflicts && state.conflicts.count > 0) return;
  for (var g = 0; g < n; g++) if (counts[g] !== 1) return;

  state.status = 'won';
  if (guide.open) closeGuide();
  stopTimer();
  sfx('win');
  buzz([20, 40, 20, 40, 80]);
  updateStats();
  updateHint();
  announce('解开了！用时 ' + formatTime(state.elapsed));

  boardEl.classList.add('is-won');
  for (var i = 0; i < view.cells.length; i++) {
    if (state.marks[i] !== 2) continue;
    var r = (i / n) | 0, c = i % n;
    view.cells[i].style.setProperty('--win-delay', ((r + c) * 36) + 'ms');
  }

  burstConfetti();

  save();

  window.setTimeout(function () {
    if (state.status !== 'won') return;
    showResult();
  }, REDUCE_MOTION ? 200 : 900);
}

export function burstConfetti() {
  if (REDUCE_MOTION) return;
  var rect = boardEl.getBoundingClientRect();
  var colors = ['#FFD93D', '#FF6B6B', '#4FC46F', '#5B9DFF', '#A06BE8', '#FFFFFF'];
  for (var i = 0; i < 34; i++) {
    var p = document.createElement('i');
    p.className = 'confetti';
    var x = rect.left + rect.width * (0.15 + Math.random() * 0.7);
    var y = rect.top + rect.height * (0.2 + Math.random() * 0.4);
    var dx = (Math.random() - 0.5) * (rect.width * 0.9);
    var dy = (0.35 + Math.random() * 0.6) * Math.min(window.innerHeight, 620);
    p.style.left = x + 'px';
    p.style.top = y + 'px';
    p.style.setProperty('--c', colors[i % colors.length]);
    p.style.setProperty('--x', dx + 'px');
    p.style.setProperty('--y', dy + 'px');
    p.style.setProperty('--r', (Math.random() * 720 - 360) + 'deg');
    p.style.setProperty('--d', (Math.random() * 160) + 'ms');
    fxEl.appendChild(p);
    window.setTimeout(function (el) {
      return function () { if (el.parentNode) el.parentNode.removeChild(el); };
    }(p), 1900);
  }
}

/* ==========================================================
   结果层
   ========================================================== */
export function showResult() {
  if (view.resultOpen) return;
  view.resultOpen = true;
  resSize.textContent = state.size + '×' + state.size;
  resTime.textContent = formatTime(state.elapsed);
  resHints.textContent = String(state.hints);
  resultSub.textContent = state.size + '×' + state.size + ' · 用时 ' + formatTime(state.elapsed) +
    (state.vibe ? ' · ' + state.vibe.level + ' ' + state.vibe.score.toFixed(1) : '');
  resultEl.hidden = false;
  window.setTimeout(function () { btnAgain.focus(); }, 80);
}

export function dismissResult() {
  if (!view.resultOpen) return;
  view.resultOpen = false;
  resultEl.hidden = true;
  boardEl.classList.remove('is-won');
  updateStats();
}
