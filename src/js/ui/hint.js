/* ============================================================================
 * hint.js
 * 提示行文案：常态提示、临时提示（1.7s 后自动回到常态）。
 * ========================================================================== */

import { listOf } from '../looks/index.js';
import { hintEl } from '../core/dom.js';
import { settings, state } from '../core/state.js';
import { queenCount } from '../game/rules.js';

/* 临时提示的计时器：非 null 表示提示行正被一句临时文案占着，
 * 这期间 render() 触发的 updateHint() 不应该把话抢回去。 */
var hintTimer = null;

/* 常态那句「轻点标 ×」跟着外观走：换成「点」以后还念 × 会让人找不到东西。
 * 拖动方式（按行列对齐 / 随意涂）也是同一件事，一起在文案里说清楚。
 * 文案本身写在提供这套叉的插件里（looks/classic.js），这里只挑该怎么念。 */
function idleHint() {
  var marks = listOf('mark');
  for (var i = 0; i < marks.length; i++) {
    var st = marks[i];
    if (st.id !== settings.markStyle) continue;
    if (!settings.alignDrag && st.hintFree) return st.hintFree;
    if (st.hint) return st.hint;
    break;
  }
  return (marks[0] && marks[0].hint) || '轻点标记，按住可以连涂';
}

export function updateHint() {
  if (hintTimer) return;
  hintEl.classList.remove('is-alert', 'is-ok');
  if (state.status === 'won') {
    hintEl.textContent = '解开了，漂亮！';
    hintEl.classList.add('is-ok');
    return;
  }
  if (state.status === 'lost') {
    hintEl.textContent = '时间到，这局没解开 · 重开或换一局';
    hintEl.classList.add('is-alert');
    return;
  }
  if (state.conflicts && state.conflicts.count > 0) {
    hintEl.textContent = state.conflicts.pairs[0].reason;
    hintEl.classList.add('is-alert');
    return;
  }
  var q = queenCount();
  var n = state.size;
  if (q === 0) hintEl.textContent = idleHint();
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
