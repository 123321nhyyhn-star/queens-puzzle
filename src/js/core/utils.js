/* ============================================================================
 * utils.js
 * 零散小工具：数值夹取、读屏播报、时间格式化、脉冲动画、SVG 元素构造。
 * ========================================================================== */

import { srStatus } from './dom.js';
import { state } from './state.js';

/* ==========================================================
   工具
   ========================================================== */
export function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

export function announce(text) {
  if (!srStatus) return;
  srStatus.textContent = '';
  window.setTimeout(function () { srStatus.textContent = text; }, 40);
}

export function formatTime(ms) {
  var total = Math.max(0, Math.floor(ms / 1000));
  var h = Math.floor(total / 3600);
  var m = Math.floor((total % 3600) / 60);
  var s = total % 60;
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  return h > 0 ? (h + ':' + pad(m) + ':' + pad(s)) : (pad(m) + ':' + pad(s));
}

export function idxToRC(i) { return { r: (i / state.size) | 0, c: i % state.size }; }

export function pulseClass(el, cls, ms) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  window.setTimeout(function () { el.classList.remove(cls); }, ms || 500);
}

export var SVGNS = 'http://www.w3.org/2000/svg';

export function svgEl(name, attrs) {
  var el = document.createElementNS(SVGNS, name);
  for (var k in attrs) {
    if (attrs.hasOwnProperty(k)) el.setAttribute(k, attrs[k]);
  }
  return el;
}
