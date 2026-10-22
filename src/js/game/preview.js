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
  var gap = 0.08;   // 一格四周留的缝，露出来的深色底就是格线
  var out = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + ' ' + n + '" ' +
    'width="' + n + '" height="' + n + '">' +
    '<rect width="' + n + '" height="' + n + '" fill="' + INK + '"/>';

  /* 同一行里连着的同色格合并成一个矩形：整盘一般能从 n² 个降到一半以下，
   * 而且同色块内部本来就不该有缝，合并之后看着也更整。 */
  for (var r = 0; r < n; r++) {
    var c = 0;
    while (c < n) {
      var g = regions[r * n + c];
      var c2 = c + 1;
      while (c2 < n && regions[r * n + c2] === g) c2++;
      out += '<rect x="' + f(c + gap / 2) + '" y="' + f(r + gap / 2) +
        '" width="' + f(c2 - c - gap) + '" height="' + f(1 - gap) +
        '" fill="' + (colors[g] || PAPER) + '"/>';
      c = c2;
    }
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
