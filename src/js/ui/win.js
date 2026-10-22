/* ============================================================================
 * win.js
 * 胜利判定、礼花、结果层（解开 / 时间到共用一个面板）。
 * ========================================================================== */

import { buzz, sfx } from '../core/audio.js';
import { limitExpired, stopTimer } from '../core/clock.js';
import { limitLabel, REDUCE_MOTION } from '../core/config.js';
import { boardEl, btnAgain, btnPeek, fxEl, resHints, resSize, resTime, resTimeLbl, resultEl,
  resultKicker, resultSub, resultTitle } from '../core/dom.js';
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

/* ==========================================================
   超时判负
   ----------------------------------------------------------
   由入口的 250ms 心跳调用（见 main.js）：到点就把这局封盘。
   封盘后棋盘只读（canPlay 看 status），但「重试这一局」能把同一盘棋
   原样重开一遍，不用重新出题。
   ========================================================== */
export function checkTimeout() {
  if (state.status !== 'playing') return false;
  if (!limitExpired()) return false;
  failByTimeout();
  return true;
}

export function failByTimeout() {
  if (state.status !== 'playing') return;
  state.status = 'lost';
  if (guide.open) closeGuide();
  stopTimer();
  updateStats();
  updateHint();
  boardEl.classList.add('is-lost');
  boardEl.classList.remove('is-won');
  sfx('fail');
  buzz([30, 60, 30]);
  announce('时间到，这局没解开');
  save();
  showResult();
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
   ----------------------------------------------------------
   解开与超时共用一张卡，按 state.status 换文案与按钮：
     解开：再来一局 / 看看棋盘
     超时：重试这一局（同一盘棋重开）/ 换一局新的
   ========================================================== */
export function showResult() {
  if (view.resultOpen) return;
  var lost = state.status === 'lost';
  view.resultOpen = true;

  resultEl.dataset.kind = lost ? 'lost' : 'won';
  resultKicker.textContent = lost ? 'TIME UP' : 'PUZZLE SOLVED';
  resultTitle.textContent = lost ? '时间到' : '解开了';

  resSize.textContent = state.size + '×' + state.size;
  resTime.textContent = lost ? limitLabel(state.limit) : formatTime(state.elapsed);
  resTimeLbl.textContent = lost ? '限时' : '用时';
  resHints.textContent = String(state.hints);

  resultSub.textContent = lost
    ? state.size + '×' + state.size + ' · 限时 ' + limitLabel(state.limit) +
      ' · 还差 ' + Math.max(0, state.size - queenCount()) + ' 只皇后'
    : state.size + '×' + state.size + ' · 用时 ' + formatTime(state.elapsed) +
      (state.vibe ? ' · ' + state.vibe.level + ' ' + state.vibe.score.toFixed(1) : '');

  btnAgain.textContent = lost ? '重试这一局' : '再来一局';
  btnPeek.textContent = lost ? '换一局新的' : '看看棋盘';

  resultEl.hidden = false;
  window.setTimeout(function () { btnAgain.focus(); }, 80);
}

/* 输掉的那一屏必须做个选择（重试 / 换一局），不能 Esc 一下就没了：
 * 关掉之后棋盘是封的，只剩「新一局」一条路，容易点得莫名其妙。
 * 换盘、重开这类真的要收面板的地方传 force = true。 */
export function dismissResult(force) {
  if (!view.resultOpen) return;
  if (state.status === 'lost' && !force) return;
  view.resultOpen = false;
  resultEl.hidden = true;
  boardEl.classList.remove('is-won');
  updateStats();
}
