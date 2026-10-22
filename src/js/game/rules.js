/* ============================================================================
 * rules.js
 * 从盘面推派生状态：自动打叉、被逼定位、冲突对、色块计数、填错的色块。
 * ========================================================================== */

import { state } from '../core/state.js';

/* ==========================================================
   派生状态
   ========================================================== */
export function computeAuto() {
  var n = state.size;
  var total = n * n;
  var auto = new Uint8Array(total);
  var marks = state.marks;
  var i;

  // 1) 某个色块已经放好皇后 → 整块剩下的格子都不能再放
  var filled = new Uint8Array(n);
  for (i = 0; i < total; i++) {
    if (marks[i] === 2) filled[state.regions[i]] = 1;
  }
  for (i = 0; i < total; i++) {
    if (marks[i] !== 2 && filled[state.regions[i]]) auto[i] = 1;
  }

  // 2) 同行、同列、八邻域
  for (var r = 0; r < n; r++) {
    for (var c = 0; c < n; c++) {
      if (marks[r * n + c] !== 2) continue;
      for (var k = 0; k < n; k++) {
        if (k !== c) auto[r * n + k] = 1;
        if (k !== r) auto[k * n + c] = 1;
      }
      for (var dr = -1; dr <= 1; dr++) {
        for (var dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          var rr = r + dr, cc = c + dc;
          if (rr >= 0 && rr < n && cc >= 0 && cc < n) auto[rr * n + cc] = 1;
        }
      }
    }
  }

  for (i = 0; i < total; i++) {
    if (marks[i] === 2) auto[i] = 0;
  }
  return auto;
}

/* 每个单位里「只剩一个还没打 × 的格子」——返回位掩码：
   1 = 所在色块只剩这一格，2 = 所在行只剩这一格，4 = 所在列只剩这一格。
   同一格可能同时被行、列、色块三种理由逼定，所以用按位或累积。

   ⚠ 判定只认棋盘上**看得见**的东西：皇后和 ×（手动标的 + 自动打叉画出来的），
   其余一律算活格。关掉「自动打叉」后棋盘上只剩玩家自己划的 ×，
   这时提示就只会依据这些 × 来算——不会出现「一个 × 都没有却说这里是唯一位置」。 */
export var FORCED_REGION = 1, FORCED_ROW = 2, FORCED_COL = 4;

export function computeForced(auto) {
  var n = state.size;
  var total = n * n;
  var mask = new Uint8Array(total);
  var i, r, c, u;

  var rowHas = new Uint8Array(n);
  var colHas = new Uint8Array(n);
  var regionHas = new Uint8Array(n);
  for (i = 0; i < total; i++) {
    if (state.marks[i] !== 2) continue;
    rowHas[(i / n) | 0] = 1;
    colHas[i % n] = 1;
    regionHas[state.regions[i]] = 1;
  }

  // 三种单位共用这一份「活格」目录：没画皇后、也没画 × 的格子
  var regCnt = new Int16Array(n), regLast = new Int32Array(n).fill(-1);
  var rowCnt = new Int16Array(n), rowLast = new Int32Array(n).fill(-1);
  var colCnt = new Int16Array(n), colLast = new Int32Array(n).fill(-1);
  for (i = 0; i < total; i++) {
    if (state.marks[i] !== 0) continue;   // 皇后 / 手标 ×
    if (auto[i]) continue;                // 自动打叉画出来的 ×
    r = (i / n) | 0;
    c = i % n;
    var g = state.regions[i];
    regCnt[g]++; regLast[g] = i;
    rowCnt[r]++; rowLast[r] = i;
    colCnt[c]++; colLast[c] = i;
  }
  // 某单位一只皇后都没放、活格又只剩 1 个 → 那一格被逼定
  for (u = 0; u < n; u++) {
    if (!regionHas[u] && regCnt[u] === 1) mask[regLast[u]] |= FORCED_REGION;
    if (!rowHas[u] && rowCnt[u] === 1) mask[rowLast[u]] |= FORCED_ROW;
    if (!colHas[u] && colCnt[u] === 1) mask[colLast[u]] |= FORCED_COL;
  }
  return mask;
}

export function computeConflicts() {
  var n = state.size;
  var qs = [];
  var i;
  for (i = 0; i < n * n; i++) {
    if (state.marks[i] === 2) {
      qs.push({ i: i, r: (i / n) | 0, c: i % n, g: state.regions[i] });
    }
  }

  var pairs = [];
  var cells = new Set();
  for (var a = 0; a < qs.length; a++) {
    for (var b = a + 1; b < qs.length; b++) {
      var A = qs[a], B = qs[b];
      var reason = null;
      if (A.g === B.g) reason = '两只皇后在同一个色块里';
      else if (A.r === B.r) reason = '两只皇后在同一行';
      else if (A.c === B.c) reason = '两只皇后在同一列';
      else if (Math.abs(A.r - B.r) <= 1 && Math.abs(A.c - B.c) <= 1) reason = '两只皇后挨在一起了';
      if (reason) {
        pairs.push({ a: A, b: B, reason: reason });
        cells.add(A.i);
        cells.add(B.i);
      }
    }
  }
  return { pairs: pairs, cells: cells, count: pairs.length };
}

export function regionCounts() {
  var counts = new Array(state.size).fill(0);
  for (var i = 0; i < state.marks.length; i++) {
    if (state.marks[i] === 2) counts[state.regions[i]]++;
  }
  return counts;
}

export function queenCount() {
  var n = 0;
  for (var i = 0; i < state.marks.length; i++) if (state.marks[i] === 2) n++;
  return n;
}

/* ---- 填错的色块 ----
 * 一个色块整块都被 × 填满、却一颗皇后都没有：这块已经不可能放下了，
 * 说明前面哪一步铺错了。手动打的 × 和自动标出的 × 都算 —— 自动 × 本来就是
 * 从已放的皇后推出来的，推空同样说明局面有矛盾。
 * 判据只看「还有没有没打叉的格子」，不看皇后数：
 * 有皇后就不算错（哪怕别处有冲突，那是冲突线的活儿）。 */
export function badRegions(auto) {
  var n = state.size, total = n * n;
  var hasQ = new Uint8Array(n);
  var open = new Uint16Array(n);
  for (var i = 0; i < total; i++) {
    var g = state.regions[i];
    if (state.marks[i] === 2) { hasQ[g] = 1; continue; }
    if (state.marks[i] !== 1 && !auto[i]) open[g]++;
  }
  var list = [];
  for (var k = 0; k < n; k++) if (!hasQ[k] && open[k] === 0) list.push(k);
  return list;
}
