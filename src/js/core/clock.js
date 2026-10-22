/* ============================================================================
 * clock.js
 * 计时：只在玩家真的有动作后才起表，切后台自动暂停。
 *
 * 这里只做「状态里的时间账」，顺带把读数写进顶栏（DOM 引用来自 core/dom）。
 * ========================================================================== */

import { timeText } from './dom.js';
import { hasProgress, state } from './state.js';
import { formatTime } from './utils.js';

/* ==========================================================
   计时
   ========================================================== */
export function elapsedMs() {
  return state.elapsed + (state.runningSince ? (performance.now() - state.runningSince) : 0);
}

export function startTimer() {
  if (state.runningSince || state.status !== 'playing') return;
  if (!hasProgress()) return;
  state.runningSince = performance.now();
}

export function pauseTimer() {
  if (!state.runningSince) return;
  state.elapsed += performance.now() - state.runningSince;
  state.runningSince = 0;
}

export function stopTimer() {
  pauseTimer();
  timeText.textContent = formatTime(state.elapsed);
}
