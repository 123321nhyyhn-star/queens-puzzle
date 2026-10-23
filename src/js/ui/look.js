/* ============================================================================
 * look.js
 * 外观面板：三排「展柜」，一排挑色块的花样，一排挑叉，一排挑皇后长什么样。
 * ----------------------------------------------------------------------------
 * 选项不再写在这个文件里：按钮是按 looks/index.js 登记的外观插件现场生成的，
 * 一排里跨了好几个插件时，每个展位左上角会挂一个插件名的小标签。
 *
 * 跟棋盘大小那套 pending 不一样：外观是**即时生效**的（跟音效 / 冲突高亮一类），
 * 选完立刻写 settings、存盘、落到 <html data-*> 上，棋盘跟着变。
 * ========================================================================== */

import { buzz, sfx } from '../core/audio.js';
import {
  app, btnLook, lookSheet, lookWrap, markNow, markRow, pieceNow, pieceRow,
  surfaceNow, surfaceRow
} from '../core/dom.js';
import { REGION_COLORS, shadeOf } from '../core/palette.js';
import { settings, view } from '../core/state.js';
import { saveSettings } from '../core/storage.js';
import { announce } from '../core/utils.js';
import { applyPieceStyle } from '../game/board.js';
import { applySurface } from '../game/skin.js';
import {
  DEFAULT_LOOK, KIND, KINDS, groupsOf, styleId, styleName
} from '../looks/index.js';

/* 每类外观落在面板里的容器与「当前：…」那行小字 */
var ROW_ELS = {
  surface: { row: surfaceRow, now: surfaceNow },
  mark: { row: markRow, now: markNow },
  piece: { row: pieceRow, now: pieceNow }
};

/* 展位右上角那枚勾：选中才亮，用一块黄圆点把「就是这套」说清楚 */
var TICK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M6.4 12.6l3.6 3.6 7.6-8" fill="none" stroke="currentColor" stroke-width="3.6" ' +
  'stroke-linecap="round" stroke-linejoin="round"/>' +
  '</svg>';

/* 色块图案的预览挑这四枚：图形彼此差得远，2×2 摆开一眼能看出这套花样是什么脾气 */
var SKIN_PICKS = [8, 14, 5, 10];

/* 柜子里摆什么：把这一套缩小画一份摆在台子上 */
function preview(kind, o) {
  if (kind === 'surface') {
    /* 2×2 的一小块棋盘：底色 + 图形，就是它在盘子上缩小的样子。
     * 预览里的图案比棋盘上**深一点**（tone 放大一倍多）：缩到五十来像素，
     * 按棋盘那个浓度画就等于什么都没画，展柜里得让人认出这是哪一套。 */
    var c = 50;
    var ink = o.motifs ? Math.max(.02, Math.min(.16, (o.tone || 0) * 2.4)) : 0;
    var out = '';
    for (var k = 0; k < 4; k++) {
      var ci = SKIN_PICKS[k] % REGION_COLORS.length;
      var color = REGION_COLORS[ci];
      var x = (k % 2) * c, y = ((k / 2) | 0) * c;
      out += '<rect x="' + x + '" y="' + y + '" width="' + c + '" height="' + c +
        '" fill="' + color + '"/>';
      if (o.motifs && o.motifs[ci]) {
        var tone = shadeOf(color, ink);
        out += '<g transform="translate(' + x + ' ' + y + ') scale(.5)"' +
          ' fill="' + tone + '" style="color:' + tone + '">' + o.motifs[ci] + '</g>';
      }
    }
    return '<span class="pv-skin"><svg viewBox="0 0 100 100" aria-hidden="true">' +
      out + '</svg></span>';
  }

  if (kind === 'mark') {
    return o.preview === 'dot'
      ? '<span class="pv-dot"></span>'
      : '<span class="pv-x"><i></i><i></i></span>';
  }

  return o.svg || '';
}

/* 一个展位：上面是罩在玻璃里的台子，下面是名牌（只写名字，不加描述）。
 * src 只有在这一排跨了多个插件时才给：一个插件的东西不用自己标自己。 */
function slotHtml(kind, o, src) {
  return '<span class="sc-case" aria-hidden="true">' +
      '<span class="sc-lamp"></span>' +
      '<span class="sc-item">' + preview(kind, o) + '</span>' +
      '<span class="sc-plinth"></span>' +
      '<span class="sc-glass"></span>' +
      (src ? '<span class="sc-src">' + src + '</span>' : '') +
    '</span>' +
    '<span class="sc-plate"><b>' + o.name + '</b></span>' +
    '<span class="sc-tick" aria-hidden="true">' + TICK_SVG + '</span>';
}

/* 选项按插件现场生成，跟限时挡位一个规矩：插件登记一处，面板跟着变。
 * 按钮的可读名就取名牌上的字（预览是 aria-hidden 的），不再另写 aria-label，
 * 免得读屏念出「叉的样式：叉」这种自己重复一遍的话。 */
function buildCase(kind) {
  var host = ROW_ELS[kind].row;
  if (!host || host.childNodes.length) return;
  var groups = groupsOf(kind);
  var multi = groups.length > 1;
  for (var g = 0; g < groups.length; g++) {
    var items = groups[g].items;
    for (var i = 0; i < items.length; i++) {
      var o = items[i];
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'showcase';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', 'false');
      b.dataset[kind] = o.id;
      b.dataset.plugin = o.plugin;
      b.title = (multi ? o.pluginName + ' · ' : '') + o.name +
        (o.desc ? '：' + o.desc : '');
      b.innerHTML = slotHtml(kind, o, multi ? o.pluginName : '');
      host.appendChild(b);
    }
  }
}

for (var kk = 0; kk < KINDS.length; kk++) buildCase(KINDS[kk]);

/* ==========================================================
   落地与同步
   ========================================================== */
/* 色块：<html data-surface> + 重建图案 defs + 逐格换 href（game/skin.js）。
 * 叉：只改 <html data-mark>，CSS 自己会换画法（不需要重画格子）。
 * 皇后：<html data-piece> 管占位，格子里的画由 board.js 换。
 * 三样都只是「画法」，不碰 state.marks，也不影响存档里的局面。 */
export function applyLook() {
  var root = document.documentElement;
  root.setAttribute('data-mark', settings.markStyle);
  root.setAttribute('data-piece', settings.pieceStyle);
  applySurface();   // 顺带写 data-surface、建 defs、给每格上墨色
  // 只在真的换了样式时重画格子里的画：新棋盘本来是照当前样式建的，不用再刷一遍
  if (view.lookPiece !== settings.pieceStyle) applyPieceStyle();
  syncLook();
}

export function syncLook() {
  for (var k = 0; k < KINDS.length; k++) {
    var kind = KINDS[k];
    var els = ROW_ELS[kind];
    var id = settings[KIND[kind].key];
    var btns = els.row ? els.row.querySelectorAll('.showcase') : [];
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].dataset[kind] === id;
      btns[i].classList.toggle('is-on', on);
      btns[i].setAttribute('aria-checked', on ? 'true' : 'false');
    }
    if (els.now) els.now.textContent = '当前：' + styleName(kind, id);
  }

  /* 顶栏那颗按钮上挂一颗小黄点：说明「你现在看的是换过的样式」，
   * 不然以后忘了默认长什么样，会以为是坏了。 */
  var custom = false;
  for (var j = 0; j < KINDS.length; j++) {
    if (settings[KIND[KINDS[j]].key] !== DEFAULT_LOOK[KINDS[j]]) custom = true;
  }
  if (btnLook) {
    btnLook.classList.toggle('is-set', custom);
    btnLook.setAttribute('aria-label', custom ? '外观，已换过样式' : '外观');
  }
}

export function pickLook(kind, id) {
  if (!KIND[kind]) return;
  var key = KIND[kind].key;
  id = styleId(kind, id);
  if (settings[key] === id) return;
  settings[key] = id;
  saveSettings();
  applyLook();
  sfx('x');
  buzz(6);
  announce(KIND[kind].label + '改成「' + styleName(kind, id) + '」');
}

/* ==========================================================
   面板开关
   ----------------------------------------------------------
   跟设置 / 难度 / 战绩三个面板同一套：app 设 inert，canPlay() 也拦，
   否则键盘事件挂在 document 上，面板背后还能落子。
   ========================================================== */
export function openLook() {
  if (view.lookOpen) return;
  view.lookOpen = true;
  syncLook();
  lookWrap.hidden = false;
  if ('inert' in HTMLElement.prototype) app.inert = true;
  else app.setAttribute('aria-hidden', 'true');
  btnLook.setAttribute('aria-expanded', 'true');
  lookSheet.focus();
}

export function closeLook() {
  if (!view.lookOpen) return;
  view.lookOpen = false;
  lookWrap.hidden = true;
  if ('inert' in HTMLElement.prototype) app.inert = false;
  app.removeAttribute('aria-hidden');
  if (btnLook) btnLook.setAttribute('aria-expanded', 'false');
  // 关掉之后焦点回到顶栏那颗按钮，键盘用户不用重新 Tab 一遍
  if (btnLook && btnLook.focus) btnLook.focus();
}
