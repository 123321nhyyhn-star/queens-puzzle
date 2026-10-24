/* ============================================================================
 * share.js · 分享码的取用与载入
 * ----------------------------------------------------------------------------
 * 「分享这一局」那一块 UI 住在本局信息页里（markup 跟着面板走，
 * ui/panels/info.js），而且只剩一行：左边的说明 + 右上角那颗**复制**。
 * **没有代码框**——这一页既不显示那串码，也不接受输入。载入只有一处：
 * 「新的一局」面板右上角那颗图标。这里管数据这一头：
 *
 *   · currentShareCode —— 现算这一局的码（复制按钮用）
 *   · copyText / setShareStatus / clearShareStatus —— 复制与那一行状态字
 *   · tryLoadShare —— 校验并装上别人给的盘（载入图标走它）
 *   · loadShareFromClipboard —— 载入图标点下去时先从剪贴板取那串代码
 *   · takeHashCode —— 链接里带 #QNS1-... 时开局直接用
 *
 * 状态行那一个元素由面板在 mount() 时用 bindShareUI() 交进来。这样这个文件
 * 不再认识任何 DOM id，「分享」也就不会绑着某一个面板一起被搬。
 * ========================================================================== */

import { applyBoard, hideVeil, showVeil, veilDelayFor } from '../app/puzzle.js';
import { buzz, sfx } from '../core/audio.js';
import { closeTopSheet } from '../core/sheet.js';
import { state } from '../core/state.js';
import { announce } from '../core/utils.js';
import { decodeShare, encodeShare, shareFailText } from '../game/share-code.js';
import { flashHint } from './hint.js';

/* 由信息页面板交进来：{ status, sheetWrap } */
var ui = null;

export function bindShareUI(o) { ui = o; }

/* 这一局的分享码。页面上不再显示它，所以每次用的时候现算——
 * 盘一变读数就跟着变，不存在「框里还留着上一局的码」这种事。 */
export function currentShareCode() {
  if (!state.regions || !state.solution) return '';
  return encodeShare(state.size, state.regions, state.solution);
}

export function setShareStatus(text, kind) {
  var el = ui && ui.status;
  /* 只在信息页真的露着的时候写那一行：从「新的一局」那层载入时，那行字
   * 在藏起来的面板里，写了也没人看得见——改说到提示行上。 */
  var visible = el && !(ui.sheetWrap && ui.sheetWrap.hidden);
  if (visible) {
    el.textContent = text || '';
    el.classList.toggle('is-good', kind === 'good');
    el.classList.toggle('is-bad', kind === 'bad');
    return;
  }
  if (text) flashHint(text, kind === 'good', 2600);
}

/* 面板每次打开都从干净的一行开始（上一次的「已复制」不该留到下一次） */
export function clearShareStatus() {
  var el = ui && ui.status;
  if (!el) return;
  el.textContent = '';
  el.classList.remove('is-good', 'is-bad');
}

/* 剪贴板：局域网 http 下没有 navigator.clipboard（不是安全上下文），
 * 所以要有一条 execCommand 的兜底。页面上已经没有代码框了，
 * 兜底自己开一个临时 textarea：固定定位、1px、全透明，只活这一次调用，
 * 不参与排版也不会把面板顶出滚动。 */
export function copyText(text, done) {
  function fallback() {
    var ok = false;
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;' +
      'padding:0;border:0;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    try {
      ta.select();
      ta.setSelectionRange(0, text.length);
      ok = document.execCommand('copy');
    } catch (e) { ok = false; }
    ta.parentNode.removeChild(ta);
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
    /* 载入只从「新的一局」那颗图标发起，但关的是「当前开着的那层」——
     * 别把「关谁」写死在某一个面板上（战绩里的「玩这盘」也走这条路）。 */
    closeTopSheet();
    clearShareStatus();
    sfx('share');
    buzz(12);
    flashHint('已载入 ' + n + '×' + n + ' 的棋盘', true, 2200);
    announce('已载入分享的棋盘：' + n + '×' + n);
  };

  if (n >= 13) window.requestAnimationFrame(function () { window.setTimeout(run, 30); });
  else run();
}

/* ==========================================================
   从剪贴板载入（「新的一局」面板右上角那颗图标）
   ----------------------------------------------------------
   场景就一种：朋友发来一串代码，我先复制，再来点载入。所以先读剪贴板。
   读不到的情况不少（局域网 http 下压根没有 navigator.clipboard.readText），
   退回原生输入框让玩家自己粘——手机上多一个系统对话框，比让人绕去另一个
   面板粘要少走两步。
   ========================================================== */
export function loadShareFromClipboard() {
  if (navigator.clipboard && navigator.clipboard.readText && window.isSecureContext) {
    navigator.clipboard.readText().then(function (text) {
      if (text && text.trim()) tryLoadShare(text);
      else shareReject('剪贴板是空的：先把朋友发来的代码复制下来');
    }, function () { askPasteByPrompt(); });
    return;
  }
  askPasteByPrompt();
}

function askPasteByPrompt() {
  var text = '';
  try {
    text = window.prompt('把棋盘代码粘在这里（QNS1- 开头那一串）', '') || '';
  } catch (e) { text = ''; }
  if (!text.trim()) return;   // 取消当没点过，不刷一条红字
  tryLoadShare(text);
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
