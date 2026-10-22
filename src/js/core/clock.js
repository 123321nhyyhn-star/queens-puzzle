/* ============================================================================
 * clock.js
 * 计时：只在玩家真的有动作后才起表，切后台自动暂停。
 *
 * 这里只做「状态里的时间账」，顺带把读数写进顶栏（DOM 引用来自 core/dom）。
 * 挑战的限时也在这里算：剩余时间 = 限时 - (已用时 - 起算点)，切后台一样不吃亏。
 * ========================================================================== */

import { timePill, timeText } from './dom.js';
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
  paintClock();
}

/* ==========================================================
   限时
   ========================================================== */
var LOW_LEFT = 30000;   // 最后 30 秒把胶囊点亮

/** 距离超时还剩多少毫秒；没开限时返回 Infinity。 */
export function limitRemaining() {
  if (!state.limit) return Infinity;
  return state.limit - (elapsedMs() - (state.limitFrom || 0));
}

export function limitExpired() {
  return state.limit > 0 && limitRemaining() <= 0;
}

/* 顶栏那颗计时胶囊：没限时显示已用时，开了限时显示倒计时。
 * 倒计时用「进位」而不是截断，最后 1 秒才会跳到 00:00，
 * 否则 00:00 会白挂一整个 999ms，看着像已经结束了却没判负。 */
export function paintClock() {
  var on = state.limit > 0 && state.status !== 'won';
  var left = limitRemaining();
  var playing = state.status === 'playing';

  timeText.textContent = formatTime(on
    ? Math.max(0, Math.ceil(left / 1000) * 1000)
    : elapsedMs());

  timePill.classList.toggle('is-countdown', on);
  timePill.classList.toggle('is-low', on && playing && left <= LOW_LEFT);
  timePill.setAttribute('aria-label', on
    ? '剩余时间 ' + formatTime(Math.max(0, Math.ceil(left / 1000) * 1000))
    : '用时 ' + formatTime(elapsedMs()));
}
