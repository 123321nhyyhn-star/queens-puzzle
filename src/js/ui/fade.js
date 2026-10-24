/* ============================================================================
 * fade.js
 * 淡化：填好的格子退到后面去。
 * ----------------------------------------------------------------------------
 * 棋盘填过一半以后，满屏的 × 和皇后会跟「还没处理的空格」抢同一份注意力。
 * 设置里两个开关（淡化 × / 淡化皇后）打开之后，这类格子的底色会退成背景纸色、
 * 格子里的画也淡一档（整格淡，不是只淡画）；色块边线不跟着淡 ——
 * 它画在棋盘的另一层，块与块的界线照样清楚。
 *
 * 0.5 秒防抖：刚落下的子、刚打的叉先原样亮着，手停下来半秒才一起淡下去。
 * 没有这道延迟的话，连标十几格就是十几下「亮 → 暗」的闪，比不淡还吵。
 * 已经淡着的格子不参与：新的一笔只把刚变的那几格点亮，整盘不会闪一下。
 *
 * 挂的是一个 .is-dim 类，淡成什么样写在 styles/base/board-states.css 里（底色换成纸色、
 * 画降到一档透明度）。判断只看「这格有没有 ×、有没有皇后」，跟外观面板选的
 * 是哪种画法无关 —— 以后加新外观也不用改这里。
 * ========================================================================== */

import { settings, state, view } from '../core/state.js';

/* 手停下多久才淡。太短会跟着笔画一路闪，太长又像「没生效」。 */
var DIM_DELAY = 500;

var timer = 0;
var dirty = false;   // 这一轮 render 里有没有格子刚变过

/* 这一格该不该淡：看它现在是什么，也看两个开关各自开没开。
 * 手标的 × 和自动打的 × 是一件事（都是「这格不用了」），统一归「淡化 ×」管。 */
function wants(i) {
  var m = state.marks ? state.marks[i] : 0;
  if (m === 2) return !!settings.fadeQueen;
  if (m === 1) return !!settings.fadeMark;
  return !!settings.fadeMark && !!(state.auto && state.auto[i]);
}

/* 按当前局面整体刷一遍：该淡的挂上，不该淡的摘掉 */
function paint() {
  for (var i = 0; i < view.cells.length; i++) {
    var cell = view.cells[i];
    if (wants(i)) cell.classList.add('is-dim');
    else cell.classList.remove('is-dim');
  }
}

/* ==========================================================
 * 给 render.js 用的两个口子
 * ========================================================== */
/* 每格报一次：changed = 上一次渲染时它还不是现在这样。
 * 刚变过的格子先摘掉淡化（亮给你看），并把「稍后统一变淡」排上队。 */
export function fadeCell(cell, i, changed) {
  if (!wants(i)) {
    cell.classList.remove('is-dim');
    return;
  }
  if (!changed) return;      // 已经淡着的就让它淡着，别整盘闪一下
  cell.classList.remove('is-dim');
  dirty = true;
}

/* 一轮 render 收尾调一次：这一轮真的动过东西，才重新开始等 0.5 秒。
 * 从最后一次变动算起，所以拖动连涂时不会涂到一半就淡下去。 */
export function settleFade() {
  if (!dirty) return;
  dirty = false;
  if (timer) window.clearTimeout(timer);
  timer = window.setTimeout(function () {
    timer = 0;
    paint();
  }, DIM_DELAY);
}

/* 拨开关时立刻落地：人正盯着效果看，不该再等半秒。
 * 顺手把还在等的那次提醒作废，免得半秒后又刷一遍（结果一样，但会多一次过渡）。 */
export function applyFadeNow() {
  dirty = false;
  if (timer) { window.clearTimeout(timer); timer = 0; }
  paint();
}
