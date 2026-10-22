/* ============================================================================
 * layout.js
 * 布局：棋盘边长只由舞台尺寸决定，任何浮层开关都不许挪动棋盘。
 * ========================================================================== */

import { app, boardEl, gridEl, regionsEl, stage, stageHeadEl, toolbarEl } from '../core/dom.js';
import { state } from '../core/state.js';
import { clamp } from '../core/utils.js';
import { refreshPeek } from '../game/board.js';
import { refreshGuidePaint } from './guide.js';
import { drawLinks, drawRegionBorders, refreshBad } from './render.js';

/* ==========================================================
   布局
   ----------------------------------------------------------
   唯一目标：**棋盘的位置和大小只由「舞台尺寸 + 棋盘边长」决定**。
   所以这里的输入里没有引导面板、没有提示文案、没有难度标签 ——
   面板是浮层，提示行定高，标签用绝对留白，谁开关都不许动棋盘。
   ========================================================== */
export function relayout() {
  var n = state.size;
  // 24 = 舞台左右各 12px 内边距；再减 6 是棋盘外框（3px × 2），
  // 这样 n*cell + 6 永远塞得进内容区，不会溢出去（以前会多出 6px，提示行就对齐不上）
  var availW = stage.clientWidth - 24;
  // 提示行 + 信息条算作一块（.stage-head）：两者都贴着棋盘，占了多高就扣多高
  var headH = stageHeadEl.offsetHeight;
  // 上下那两块弹性空白在棋盘吃满时会缩到 0，所以可用高度就是
  // 「舞台高度 − 提示 / 信息条 − 调色板 − 工具栏 − 间距」。30 是三道 gap 的余量。
  var availH = stage.clientHeight - headH -
    regionsEl.offsetHeight - toolbarEl.offsetHeight - 30;

  if (availW < 40 || availH < 40) return;

  var cell = Math.floor(Math.min((availW - 6) / n, (availH - 6) / n));
  // 下限只是「再小就没法点了」的兜底：正常算出来的 cell 本来就塞得进舞台，
  // 一旦被下限抬上去，舞台内容就会溢出、浏览器还会为上滚焦点偷偷滚整个 app。
  cell = clamp(cell, 10, 78);

  boardEl.style.setProperty('--cell', cell + 'px');
  boardEl.style.setProperty('--n', String(n));
  boardEl.style.setProperty('--bw', cell < 26 ? '1.5px' : '2px');

  // 提示行整行的宽度跟着棋盘走（含左右各 3px 外框），难度标签才有地方对齐
  stage.style.setProperty('--board-w', (n * cell + 6) + 'px');

  var chip = clamp(Math.floor((Math.min(availW, 460) - (n - 1) * 4) / n), 10, 20);
  regionsEl.style.setProperty('--chip', chip + 'px');

  gridEl.style.setProperty('--cell', cell + 'px');
  gridEl.style.setProperty('--n', String(n));

  drawRegionBorders();
  // 只重画看得见的那层：已经淡出的旧 path 不用管，下次亮之前会按新格子重画
  refreshBad();
  // 格子尺寸变了，长按中的高亮也跟着重量一遍（否则横屏一转就错位）
  refreshPeek();
  drawLinks(state.conflicts || { pairs: [], cells: new Set(), count: 0 });
  // 格子尺寸变了，圈画层里的坐标也得跟着重画（否则横屏一转就错位）
  refreshGuidePaint();
}
