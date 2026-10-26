/* ============================================================================
 * trace.js · 撤销 / 还原之后，把「刚撤掉的那一步」在棋盘上描一圈呼吸的框
 * ----------------------------------------------------------------------------
 * 撤销最难受的不是「退回去」，是退回去之后**想不起来刚才在干什么**：
 * 手指抬起来，棋盘少了一个 ×，可那个 × 本来是要说明什么？
 * 所以退完立刻把上一步动过的那几格圈出来，手一碰棋盘就灭 ——
 * 它只是「上一个动作的残影」，不是这一局的状态。
 *
 * 三条约定：
 *   · 只认「变了哪几格」：拿退回去之前和之后的整盘 marks 一比就知道了，
 *     撤销栈里不用另记东西；还原记录点走的也是这一条路。
 *   · 不进 state、不进存档：刷新回来它就该没了，跟撤销栈一个口径。
 *   · 谁来灭：任何一次落笔（app/history.js 的 pushEntry）、重做、换盘、
 *     开提示引导，都先把它收掉 —— 残影只对「紧接着的那一下」有效。
 *
 * 画法：一层 SVG（#tr），用 game/geometry.js 的 outlinePath 画出这一组格子的
 * **外轮廓**（相邻两格之间那条公共边不画），只描一圈细墨线，靠明暗呼吸来
 * 说话。之所以不逐格挂在 .cell 上：一次撤掉一整行时，逐格画会在格与格之间
 * 留缝，一整圈被切成好几块小方框，反而不像「这里变过」。
 *
 * 这圈线是「内描边」：路径比格子边线往里让半个线宽，笔画因此整条落在格子**里面**、
 * 外沿与格线严丝合缝 —— 它跟色块压在格线上的那条墨线是同一个位置，
 * 所以看着就是「这一格的边界自己在呼吸」，不会显出一道浮在里头的第二层框。
 * 颜色也压得很轻（整层只到半透明），一眼能分出「棋盘的界线」和「刚才那一步的记号」。
 *
 * 只有一条线，没有洗色也没有光晕：前一版三层叠出来的「光」太抢眼，
 * 撤销本来是件小事，屏幕上不该突然亮一块。
 *
 * 重做不点亮：重做是「往前走回刚才的位置」，落点自己看得懂，
 * 再描一圈反而像在提示「下回该点这儿」。
 * ========================================================================== */

import { trEl } from '../core/dom.js';
import { state } from '../core/state.js';
import { svgEl } from '../core/utils.js';
import { cellSize, outlinePath } from '../game/geometry.js';

/* 正在发光的格子下标；flags 是同一批格子的位图（画外轮廓时靠它判邻居）。
 * 两个都只在有残影时才非空。 */
var shown = [];
var flags = null;

/**
 * 把 prev → next 之间变了的格子圈出来。撤销 / 还原在改完 marks 之后调一次。
 *
 * @param {ArrayLike<number>} prev 动作之前的整盘 marks
 * @param {ArrayLike<number>} next 动作之后的整盘 marks
 * @returns {number[]} 圈中的格子下标（空数组 = 这一步没动任何格子，不留光）
 */
export function markTrace(prev, next) {
  clearTrace();
  if (!prev || !next) return [];

  var len = Math.min(prev.length, next.length);
  var list = [];
  var bits = new Uint8Array(len);
  for (var i = 0; i < len; i++) {
    if (prev[i] === next[i]) continue;
    list.push(i);
    bits[i] = 1;
  }
  if (!list.length) return [];

  shown = list;
  flags = bits;
  paint();
  return shown.slice();
}

/** 收掉残影。重复调没有副作用。 */
export function clearTrace() {
  if (shown.length && trEl) trEl.innerHTML = '';
  shown = [];
  flags = null;
}

/** 此刻圈着的那几格（只给 tools/ 里的自动化测试与播报用）。 */
export function traceCells() {
  return shown.slice();
}

/* 布局重排后格子尺寸变了，轮廓也得按新的 --cell 重画一遍（否则横屏一转就错位）。 */
export function refreshTrace() {
  if (shown.length) paint();
}

/* ------------------------------------------------------------ 画
 * 就一条线：.tr-line 沿格子边线画一圈**内描边** —— 路径往里让半个线宽，
 * 笔画的外沿正好压在格子的边线上（不多不少），看着就是「这一格的内侧边界」
 * 在呼吸，而不是贴在里面另起一条线。色与粗细取棋盘自己的一套
 * （stroke: var(--ink)、width: var(--bw)`），整层只在 .32–.5 之间浅浅地起伏。
 *
 * 为什么让半个线宽：笔画是**按路径居中**铺开的，路径要是正落在格子边线上，
 * 一半就跑到隔壁格去了。让开半个线宽，整条笔画刚好落在格子里面，
 * 外沿与格线齐平 —— 跟色块那条墨线位置重合，两样东西就是一条线，不会「割裂」。
 *
 * 笔画走 stroke-linejoin: miter + stroke-linecap: square，跟 .rb 同一套：
 * 外轮廓是逐笔 M…L… 拼的，square 端点各多伸半个线宽，正好把拐角填成直角。 */
function paint() {
  if (!trEl) return;
  trEl.innerHTML = '';
  if (!shown.length || !flags) return;

  var n = state.size;
  var cell = cellSize();
  if (!n || !cell || flags.length < n * n) return;

  var bw = strokeWidth();
  var d = outlinePath(n, flags, cell, bw / 2);
  if (!d) return;

  var size = n * cell;
  trEl.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
  trEl.setAttribute('width', String(size));
  trEl.setAttribute('height', String(size));

  var g = svgEl('g', { 'class': 'tr-g' });
  g.appendChild(svgEl('path', { d: d, 'class': 'tr-line' }));
  trEl.appendChild(g);
}

/* 笔画多宽：直接读棋盘上那个 `--bw`（layout.js 按格子大小给的 1.5 / 2px），
   别在这儿再抄一遍「cell < 26」的规则 —— 抄两份迟早对不上。 */
function strokeWidth() {
  var v = trEl ? parseFloat(getComputedStyle(trEl).getPropertyValue('--bw')) : 0;
  return v > 0 ? v : 2;
}
