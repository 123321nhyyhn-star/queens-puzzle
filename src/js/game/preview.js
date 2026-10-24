/* ============================================================================
 * preview.js
 * 战绩里的棋盘缩略图：把一盘棋画成一张 SVG（纯字符串，不碰 DOM）。
 * ----------------------------------------------------------------------------
 * 为什么不直接建 DOM：记录列表一次要画十几二十张盘，每张 n*n 个格子，
 * 用元素堆会一下子多出上千个节点；而 SVG 字符串塞进 <img src="data:...">，
 * 浏览器只按图片解码一次，列表滚动也不会有额外开销。
 *
 * 配色直接调 core/palette.js 的分配器，跟棋盘上看到的完全一致——
 * 同一盘棋在本体、分享码、战绩缩略图里长得一样，才认得出是同一盘。
 * ========================================================================== */

import { assignRegionColors } from '../core/palette.js';

var INK = '#3A3335';
var PAPER = '#EDE3D2';

/* 坐标都落在「一格 = 1」的世界里，viewBox 负责缩放到目标尺寸。
 * 小数保留三位就够（16×16 时误差远小于一个像素），字符数也压得住。 */
function f(v) {
  return Math.round(v * 1000) / 1000;
}

/**
 * 画一张棋盘缩略图。
 * @param {number} n 边长
 * @param {Uint8Array|number[]} regions 每格所属色块
 * @param {Int8Array|number[]} solution 每行皇后所在列
 * @param {{queens?: boolean}} [opt] queens=false 时只画色块（没解开的那局）
 * @returns {string} SVG 源码
 */
export function boardPreviewSvg(n, regions, solution, opt) {
  opt = opt || {};
  if (!n || !regions || regions.length < n * n) return '';

  var colors = assignRegionColors(n, regions);
  var gap = 0.12;        // 两个色块之间的缝，露出来的深色底就是色块边界
  var half = gap / 2;

  /* 取旁边的格子属于哪一块；盘外算「别人家」（-1），这样外沿也留一道缝 */
  function at(r, c) {
    if (r < 0 || r >= n || c < 0 || c >= n) return -1;
    return regions[r * n + c];
  }

  var out = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + ' ' + n + '" ' +
    'width="' + n + '" height="' + n + '">' +
    '<rect width="' + n + '" height="' + n + '" fill="' + INK + '"/>';

  /* 一块一条 path，缝只留在「和别的色块（或盘外）挨着」的那几条边上：
   *   · 以前按行合并、每行四周都留缝，上下相邻的同色格之间就横着一道线，
   *     一整块色块被剁成好几截（46px 上尤其明显，看着像图被切坏了）；
   *   · 现在同色块内部贴成一片，整块是连续的一块颜色；
   *   · 而且同一块的所有小矩形写进一条 path（同一种 fill），
   *     相邻矩形的公共边在一条路径里会互相抵消，不会留下抗锯齿的细缝。 */
  var paths = {}, order = [];

  for (var r = 0; r < n; r++) {
    var c = 0;
    while (c < n) {
      var g = at(r, c);
      var tIn = at(r - 1, c) === g ? 0 : half;   // 上边要不要留缝
      var bIn = at(r + 1, c) === g ? 0 : half;
      /* 一行里连着的同色格能否并成一个矩形，要看上下两条边是否也一致：
       * 上面挨着同一块的那几格贴边，挨着别人的那几格留缝，不能混着画。 */
      var c2 = c + 1;
      while (c2 < n && at(r, c2) === g &&
        (at(r - 1, c2) === g ? 0 : half) === tIn &&
        (at(r + 1, c2) === g ? 0 : half) === bIn) c2++;

      var l = at(r, c - 1) === g ? 0 : half;
      var rt = at(r, c2) === g ? 0 : half;
      var w = c2 - c - l - rt;
      var h = 1 - tIn - bIn;
      if (w > 0 && h > 0) {
        if (!paths[g]) { paths[g] = ''; order.push(g); }
        paths[g] += 'M' + f(c + l) + ' ' + f(r + tIn) +
          'h' + f(w) + 'v' + f(h) + 'h' + f(-w) + 'z';
      }
      c = c2;
    }
  }

  for (var k = 0; k < order.length; k++) {
    out += '<path d="' + paths[order[k]] + '" fill="' + (colors[order[k]] || PAPER) + '"/>';
  }

  if (opt.queens && solution) {
    for (var i = 0; i < n; i++) {
      var col = solution[i];
      // 先垫一圈白再压墨点：缩到 46px 时纯墨点会糊进色块里，白圈让它浮出来
      out += '<circle cx="' + f(col + 0.5) + '" cy="' + f(i + 0.5) + '" r="0.34" fill="#FFFFFF"/>';
      out += '<circle cx="' + f(col + 0.5) + '" cy="' + f(i + 0.5) + '" r="0.23" fill="' + INK + '"/>';
    }
  }

  return out + '</svg>';
}

/** 同上，但包成可以直接塞进 <img src> 的 data URI。 */
export function boardPreviewUri(n, regions, solution, opt) {
  var svg = boardPreviewSvg(n, regions, solution, opt);
  if (!svg) return '';
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}
