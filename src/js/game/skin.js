/* ============================================================================
 * skin.js
 * 色块图案：把外观插件提供的图形铺到棋盘上。
 * ----------------------------------------------------------------------------
 * 结构上只有两样东西：
 *   · 一张 <defs>（#skinDefs）：一套图案的每种颜色各建一枚图形；
 *   · 每格一个 <svg class="sk"><use></svg>，href 指向自己那块颜色的图形。
 *
 * 为什么用 defs + use，而不是把图形内联进每一格：16×16 也就是 512 个节点，
 * 换图案时只改 href，不用把 256 个格子重画一遍；墨色也只是一个 CSS 变量。
 *
 * 图形本身不写颜色（见 looks/index.js 的约定），填色继承 .sk 上的
 * `fill: currentColor` + `color: var(--rc-ink)`——每格一块自己的「压暗一档」。
 * 压得很淡（tone ≈ 0.05），所以在盘子上它是一片纹样，不是一排图标；
 * × 和皇后仍然是最深的东西，色块之间也还是靠颜色分。
 * ========================================================================== */

import { gridEl, skinDefsEl } from '../core/dom.js';
import { REGION_COLORS, shadeOf } from '../core/palette.js';
import { settings, view } from '../core/state.js';
import { findOf } from '../looks/index.js';

/* 没写 tone 的图案按这个来：压暗 5%，淡彩上看得见轮廓，又不跟棋子抢 */
var TONE_FALLBACK = .05;

/** 当前选中的那套色块图案（插件里的一枚 surface）。 */
export function currentSurface() {
  return findOf('surface', settings.surfaceStyle);
}

/** 某种底色在某套图案里的墨色。tone = 0 时就是底色本身（等于看不见）。 */
export function skinInk(color, surface) {
  var s = surface || currentSurface();
  var k = s && isFinite(s.tone) ? s.tone : TONE_FALLBACK;
  return shadeOf(color, k);
}

function motifId(surfaceId, ci) {
  return 'qsk-' + surfaceId + '-' + ci;
}

function hasMotif(surface, ci) {
  return !!(surface && surface.motifs && surface.motifs[ci]);
}

/** 格子里的图案层（buildBoard 用）：空 href，paintCell 会补上真的。 */
export function skinMarkup() {
  return '<svg class="sk" viewBox="0 0 100 100" aria-hidden="true" focusable="false">' +
    '<use href=""></use></svg>';
}

/* 建 <defs>：一套图案 × 调色板下标，一枚图形。
 *
 * 这里用 <g> 而不是 <symbol>：symbol 会自己开一个视口、把图形缩到「装满这一格」，
 * 以后想改成「一块色块上只落一枚大图形」时，外层 viewBox 就指挥不动它了。
 * <g> 只是把内容原样搬进当前坐标系，裁剪完全由外层的 viewBox 说了算。 */
function buildDefs(s) {
  if (!skinDefsEl) return;
  if (!s || !s.motifs) { skinDefsEl.innerHTML = ''; return; }
  var out = '';
  for (var i = 0; i < s.motifs.length; i++) {
    if (!s.motifs[i]) continue;
    out += '<g id="' + motifId(s.id, i) + '">' + s.motifs[i] + '</g>';
  }
  skinDefsEl.innerHTML = out;
}

/* 一格：图案色 + href。格子自己记住颜色下标（data-ci），换图案时不用再问局面。 */
function paintCell(cell, ci, s) {
  var color = REGION_COLORS[ci];
  if (!color) return;
  cell.dataset.ci = String(ci);
  cell.style.setProperty('--rc-ink', skinInk(color, s));
  var use = cell.querySelector('.sk use');
  if (use) use.setAttribute('href', hasMotif(s, ci) ? '#' + motifId(s.id, ci) : '');
}

/** 建棋盘时给一格挂上图案（颜色由 buildBoard 已经算好，这里只记下标与墨色）。 */
export function paintSkin(cell, color) {
  var ci = REGION_COLORS.indexOf(color);
  if (ci < 0) return;
  paintCell(cell, ci, currentSurface());
}

/**
 * 把当前这套图案落到整盘上：写 <html data-surface>、重建 defs、逐格换 href 与墨色。
 * 换图案是纯画法的事，不碰 state.marks，也不进撤销栈。
 */
export function applySurface() {
  var s = currentSurface();
  var root = document.documentElement;
  if (s) root.setAttribute('data-surface', s.id);
  else root.removeAttribute('data-surface');

  /* 有没有图案这件事交给 grid 上的一个类，而不是在 CSS 里按图案 id 写名单：
   * 插件可以随时增删，CSS 不该认识任何一套具体的图案。 */
  if (gridEl) gridEl.classList.toggle('has-skin', !!(s && s.motifs));

  buildDefs(s);

  for (var i = 0; i < view.cells.length; i++) {
    var cell = view.cells[i];
    var ci = parseInt(cell.dataset.ci, 10);
    if (!isFinite(ci) || ci < 0) {
      // 老格子没记下标（理论上不会有）：从行内 --rc 反查一次
      ci = REGION_COLORS.indexOf(cell.style.getPropertyValue('--rc').trim());
      if (ci < 0) continue;
    }
    paintCell(cell, ci, s);
  }
}
