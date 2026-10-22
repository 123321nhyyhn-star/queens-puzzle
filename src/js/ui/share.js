/* ============================================================================
 * share.js
 * 分享面板：展示 / 复制 / 粘贴载入，以及 #QNS1-... 链接开局。
 * ========================================================================== */

import { applyBoard, hideVeil, showVeil, veilDelayFor } from '../app/puzzle.js';
import { buzz, sfx } from '../core/audio.js';
import { shareCode, shareStatus, shareTag, sheetWrap } from '../core/dom.js';
import { state } from '../core/state.js';
import { announce } from '../core/utils.js';
import { decodeShare, encodeShare, shareFailText } from '../game/share-code.js';
import { flashHint } from './hint.js';
import { closeSheet } from './settings.js';

export function setShareStatus(text, kind) {
  if (!shareStatus) return;
  shareStatus.textContent = text || '';
  shareStatus.classList.toggle('is-good', kind === 'good');
  shareStatus.classList.toggle('is-bad', kind === 'bad');
}

export function refreshShareCode() {
  if (!shareCode) return;
  if (!state.regions || !state.solution) {
    shareCode.value = '';
    return;
  }
  shareCode.value = encodeShare(state.size, state.regions, state.solution);
  shareTag.textContent = state.size + '×' + state.size;
  setShareStatus('');
  fitShareCode();
}

/* 代码长的时候（16×16 有近 300 位）让框自己长高，尽量整段都露出来 */
export function fitShareCode() {
  if (!shareCode || sheetWrap.hidden) return;
  shareCode.style.height = 'auto';
  shareCode.style.height = Math.min(170, Math.max(46, shareCode.scrollHeight + 2)) + 'px';
}

/* 剪贴板：局域网 http 下没有 navigator.clipboard，需要 execCommand 兜底 */
var shareFocusHold = false;

/* 复制时代码框会被迫聚焦，那一瞬间的 focus 事件不该再把面板滚一下（见 events.js）。 */
export function isShareFocusHold() {
  return shareFocusHold;
}

export function copyText(text, done) {
  function fallback() {
    var ok = false;
    try {
      shareFocusHold = true;
      shareCode.focus();
      shareCode.select();
      shareCode.setSelectionRange(0, shareCode.value.length);
      ok = document.execCommand('copy');
    } catch (e) { ok = false; }
    window.setTimeout(function () { shareFocusHold = false; }, 260);
    done(ok);
  }
  if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
    try {
      navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
      return;
    } catch (e) { /* 继续走兜底 */ }
  }
  fallback();
}

export function shareReject(msg) {
  setShareStatus(msg, 'bad');
  sfx('conflict');
  buzz([16, 40, 16]);
}

export function tryLoadShare(raw) {
  var out = decodeShare(raw);
  if (!out.ok) { shareReject(out.msg); return; }

  var n = out.size;
  showVeil(n, '正在验证 ' + n + '×' + n + ' 棋盘', veilDelayFor(n));

  var run = function () {
    var res = null;
    try {
      res = window.QueensEngine.validate({
        size: n, regions: out.regions, solution: out.solution
      });
    } catch (e) { res = null; }

    if (!res || !res.ok) {
      hideVeil();
      shareReject(shareFailText(res && res.reason));
      return;
    }

    applyBoard(n, out.regions, out.solution, 0);
    closeSheet();
    setShareStatus('');
    sfx('share');
    buzz(12);
    flashHint('已载入 ' + n + '×' + n + ' 的棋盘', true, 2200);
    announce('已载入分享的棋盘：' + n + '×' + n);
  };

  if (n >= 13) window.requestAnimationFrame(function () { window.setTimeout(run, 30); });
  else run();
}

/* 链接里带着 #QNS1-... 时，开局直接载入那一盘 */
export function takeHashCode() {
  var h = '';
  try { h = window.location.hash || ''; } catch (e) { return null; }
  if (h.length < 2) return null;

  var out = null;
  try { out = decodeShare(decodeURIComponent(h.slice(1))); } catch (e) { out = null; }
  if (!out || !out.ok) return null;

  var res = null;
  try {
    res = window.QueensEngine.validate({ size: out.size, regions: out.regions, solution: out.solution });
  } catch (e) { res = null; }
  if (!res || !res.ok) return null;

  // 载入后把 # 抹掉，免得以后刷新都被这段代码接管
  try {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  } catch (e) { /* file:// 下可能不允许，忽略 */ }
  return out;
}
