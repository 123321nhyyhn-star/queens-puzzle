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

/* 任意一组格子的外轮廓（flags 是「这一格在不在组里」的位图）。
   跟 regionPath 是同一条规则：只画「两边一内一外」的那些边 ——
   相邻两格之间那条公共边不会出现，所以一次改了好几格时画出来是**一整圈**，
   而不是每格各描一个方框（那样格子之间的缝会把一整片光切成好几块）。

   同一条直线上的连续边合并成一笔（跟 drawRegionBorders 一个做法）：
   不合并的话，六格横排会得到 12 段首尾相接的线，端点的 round 线帽互相叠，
   半透明的笔画在接缝处会叠出一串更深的小点。

   pad：把整圈轮廓往「有格子的那一侧」收进去几个像素（默认 0 = 正压在
   格子边线上）。这是给「怕被别的东西盖住」的场合留的旋钮；残影那圈现在用 0
   ——它自己的层级已经高过色块描边了。收的时候逐边判方向，
   所以一格之隔的两段（一边收下、一边收上）不会被合并成一条斜线。 */
export function outlinePath(n, flags, cell, pad) {
  var d = '';
  if (!flags || flags.length < n * n) return d;
  pad = pad || 0;
  var r, c, start, side, s, y, x;

  /* 这一格在不在组里（越界算不在） */
  function solid(rr, cc) {
    return rr >= 0 && cc >= 0 && rr < n && cc < n && !!flags[rr * n + cc];
  }

  /* 横边：第 r 条格子线（0…n）。side = 1 表示格子在这条线下方 */
  for (r = 0; r <= n; r++) {
    start = -1; side = 0;
    for (c = 0; c <= n; c++) {
      s = 0;
      if (c < n) {
        var above = r > 0 && solid(r - 1, c);
        var below = r < n && solid(r, c);
        if (above && !below) s = -1;
        else if (!above && below) s = 1;
      }
      if (s !== side) {
        if (side) {
          y = r * cell + side * pad;
          /* 两端的收 / 放按拐角凸凹走：凹角（隔壁那一列上下两格都是组员）
           * 要往外多伸一个 pad 才能跟另一笔接上，凸角反过来收进去 ——
           * 一律收进去的话，L 形的内拐角会裂开一个小口子。 */
          var x0 = start * cell + (solid(r - 1, start - 1) && solid(r, start - 1) ? -pad : pad);
          var x1 = c * cell + (solid(r - 1, c) && solid(r, c) ? pad : -pad);
          d += 'M' + x0 + ' ' + y + 'L' + x1 + ' ' + y;
        }
        start = s ? c : -1;
        side = s;
      }
    }
  }
  /* 竖边：第 c 条格子线。side = 1 表示格子在这条线右边 */
  for (c = 0; c <= n; c++) {
    start = -1; side = 0;
    for (r = 0; r <= n; r++) {
      s = 0;
      if (r < n) {
        var left = c > 0 && solid(r, c - 1);
        var right = c < n && solid(r, c);
        if (left && !right) s = -1;
        else if (!left && right) s = 1;
      }
      if (s !== side) {
        if (side) {
          x = c * cell + side * pad;
          var y0 = start * cell + (solid(start - 1, c - 1) && solid(start - 1, c) ? -pad : pad);
          var y1 = r * cell + (solid(r, c - 1) && solid(r, c) ? pad : -pad);
          d += 'M' + x + ' ' + y0 + 'L' + x + ' ' + y1;
        }
        start = s ? r : -1;
        side = s;
      }
    }
  }
  return d;
}
