/* ============================================================================
 * geometry.js
 * 棋盘几何：量格子边长、生成某个色块的外轮廓 path / 格子 path。
 * ========================================================================== */

import { boardEl } from '../core/dom.js';

export function cellSize() {
  return parseFloat(getComputedStyle(boardEl).getPropertyValue('--cell')) || 0;
}

/* 一个色块的外轮廓：只画「邻居不是本块」的那些边 */
export function regionPath(n, regions, g, cell) {
  var d = '';
  for (var i = 0; i < n * n; i++) {
    if (regions[i] !== g) continue;
    var r = (i / n) | 0, c = i % n;
    var x = c * cell, y = r * cell;
    if (r === 0 || regions[(r - 1) * n + c] !== g) d += 'M' + x + ' ' + y + 'L' + (x + cell) + ' ' + y;
    if (r === n - 1 || regions[(r + 1) * n + c] !== g) d += 'M' + x + ' ' + (y + cell) + 'L' + (x + cell) + ' ' + (y + cell);
    if (c === 0 || regions[r * n + c - 1] !== g) d += 'M' + x + ' ' + y + 'L' + x + ' ' + (y + cell);
    if (c === n - 1 || regions[r * n + c + 1] !== g) d += 'M' + (x + cell) + ' ' + y + 'L' + (x + cell) + ' ' + (y + cell);
  }
  return d;
}

/* 一个色块占的所有格子（每格一个闭合矩形）：
   配合 evenodd 和外框一起用，等于「整盘挖掉这块」。 */
export function regionCellsPath(n, regions, g, cell) {
  var d = '';
  for (var i = 0; i < n * n; i++) {
    if (regions[i] !== g) continue;
    var x = (i % n) * cell, y = ((i / n) | 0) * cell;
    d += 'M' + x + ' ' + y + 'h' + cell + 'v' + cell + 'h' + (-cell) + 'z';
  }
  return d;
}
