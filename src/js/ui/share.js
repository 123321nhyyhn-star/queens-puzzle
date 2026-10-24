/* ============================================================================
 * share.js · 分享码的取用与载入
 * ----------------------------------------------------------------------------
 * 分享那一段 UI（代码框 / 复制 / 载入 / 状态行）住在设置面板里，markup 跟着
 * 面板走（ui/panels/settings.js）。这里只管数据这一头：
 *
 *   · refreshShareCode / fitShareCode / setShareStatus —— 往那几块元素里写东西
 *   · tryLoadShare —— 校验并装上别人给的盘（战绩面板的「玩这盘」也走它）
 *   · takeHashCode —— 链接里带 #QNS1-... 时开局直接用
 *
 * 元素由面板在 mount() 时用 bindShareUI() 交进来。这样这个文件不再认识
 * 任何 DOM id，「分享」也就不会绑着设置面板一起被搬。
 * ========================================================================== */

import { applyBoard, hideVeil, showVeil, veilDelayFor } from '../app/puzzle.js';
import { buzz, sfx } from '../core/audio.js';
import { state } from '../core/state.js';
import { announce } from '../core/utils.js';
import { decodeShare, encodeShare, shareFailText } from '../game/share-code.js';
import { flashHint } from './hint.js';

/* 由设置面板交进来：{ code, status, tag, sheetWrap, close } */
var ui = null;

export function bindShareUI(o) { ui = o; }

export function setShareStatus(text, kind) {
  var el = ui && ui.status;
  if (!el) return;
  el.textContent = text || '';
  el.classList.toggle('is-good', kind === 'good');
  el.classList.toggle('is-bad', kind === 'bad');
}

export function refreshShareCode() {
  if (!ui || !ui.code) return;
  if (!state.regions || !state.solution) {
    ui.code.value = '';
    return;
  }
  ui.code.value = encodeShare(state.size, state.regions, state.solution);
  ui.tag.textContent = state.size + '×' + state.size;
  setShareStatus('');
  fitShareCode();
}

/* 代码长的时候（16×16 有近 300 位）让框自己长高，尽量整段都露出来 */
export function fitShareCode() {
  if (!ui || !ui.code || (ui.sheetWrap && ui.sheetWrap.hidden)) return;
  ui.code.style.height = 'auto';
  ui.code.style.height = Math.min(170, Math.max(46, ui.code.scrollHeight + 2)) + 'px';
}

/* 剪贴板：局域网 http 下没有 navigator.clipboard，需要 execCommand 兜底 */
var shareFocusHold = false;

/* 复制时代码框会被迫聚焦，那一瞬间的 focus 事件不该再把面板滚一下（见设置面板）。 */
export function isShareFocusHold() {
  return shareFocusHold;
}

export function copyText(text, done) {
  function fallback() {
    var ok = false;
    try {
      shareFocusHold = true;
      ui.code.focus();
      ui.code.select();
      ui.code.setSelectionRange(0, ui.code.value.length);
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
    if (ui && ui.close) ui.close();
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
