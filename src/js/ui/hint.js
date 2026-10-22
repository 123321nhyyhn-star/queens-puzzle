/* ============================================================================
 * hint.js
 * 提示行文案：常态提示、临时提示（1.7s 后自动回到常态）。
 * ========================================================================== */

import { hintEl } from '../core/dom.js';
import { state } from '../core/state.js';
import { queenCount } from '../game/rules.js';

/* 临时提示的计时器：非 null 表示提示行正被一句临时文案占着，
 * 这期间 render() 触发的 updateHint() 不应该把话抢回去。 */
var hintTimer = null;

export function updateHint() {
  if (hintTimer) return;
  hintEl.classList.remove('is-alert', 'is-ok');
  if (state.status === 'won') {
    hintEl.textContent = '解开了，漂亮！';
    hintEl.classList.add('is-ok');
    return;
  }
  if (state.conflicts && state.conflicts.count > 0) {
    hintEl.textContent = state.conflicts.pairs[0].reason;
    hintEl.classList.add('is-alert');
    return;
  }
  var q = queenCount();
  var n = state.size;
  if (q === 0) hintEl.textContent = '轻点标 ×，按住可整行整列连涂';
  else if (q < n) hintEl.textContent = '还差 ' + (n - q) + ' 只皇后 · 双击放子';
  else hintEl.textContent = '每行每列每个色块，各一只皇后';
}

export function flashHint(text, ok, ms) {
  hintEl.textContent = text;
  hintEl.classList.remove('is-alert', 'is-ok');
  hintEl.classList.add(ok ? 'is-ok' : 'is-alert');
  if (hintTimer) window.clearTimeout(hintTimer);
  hintTimer = window.setTimeout(function () {
    hintTimer = null;
    updateHint();
  }, ms || 1700);
}
/** 立刻取消临时提示，回到常态文案（放皇后时用，免得旧提示压在新局面上）。 */
export function clearHintTimer() {
  if (hintTimer) {
    window.clearTimeout(hintTimer);
    hintTimer = null;
  }
}
