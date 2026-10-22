/* ============================================================================
 * look.js
 * 外观面板：两排「展柜」，一排挑叉的样式，一排挑皇后长什么样。
 * ----------------------------------------------------------------------------
 * 跟棋盘大小那套 pending 不一样：外观是**即时生效**的（跟音效 / 冲突高亮一类），
 * 选完立刻写 settings、存盘、落到 <html data-mark / data-piece> 上，棋盘跟着变。
 * ========================================================================== */

import { buzz, sfx } from '../core/audio.js';
import { CAT_SVG, MARK_STYLES, PIECE_STYLES, QUEEN_SVG, styleId, styleName } from '../core/config.js';
import { app, btnLook, lookSheet, lookWrap, markNow, markRow, pieceNow, pieceRow } from '../core/dom.js';
import { settings, view } from '../core/state.js';
import { saveSettings } from '../core/storage.js';
import { announce } from '../core/utils.js';
import { applyPieceStyle } from '../game/board.js';

/* 展位右上角那枚勾：选中才亮，用一块黄圆点把「就是这套」说清楚 */
var TICK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M6.4 12.6l3.6 3.6 7.6-8" fill="none" stroke="currentColor" stroke-width="3.6" ' +
  'stroke-linecap="round" stroke-linejoin="round"/>' +
  '</svg>';

/* 柜子里摆什么：把这一套缩小画一份摆在台子上 */
function preview(kind, id) {
  if (kind === 'mark') {
    return id === 'dot'
      ? '<span class="pv-dot"></span>'
      : '<span class="pv-x"><i></i><i></i></span>';
  }
  return id === 'cat' ? CAT_SVG : QUEEN_SVG;
}

/* 一个展位：上面是罩在玻璃里的台子，下面是名牌（只写名字，不加描述） */
function slotHtml(kind, o) {
  return '<span class="sc-case" aria-hidden="true">' +
      '<span class="sc-lamp"></span>' +
      '<span class="sc-item">' + preview(kind, o.id) + '</span>' +
      '<span class="sc-plinth"></span>' +
      '<span class="sc-glass"></span>' +
    '</span>' +
    '<span class="sc-plate"><b>' + o.name + '</b></span>' +
    '<span class="sc-tick" aria-hidden="true">' + TICK_SVG + '</span>';
}

/* 选项按样式表生成，跟限时挡位一个规矩：配置改一处，面板跟着变。
 * 按钮的可读名就取名牌上的字（预览是 aria-hidden 的），不再另写 aria-label，
 * 免得读屏念出「叉的样式：叉」这种自己重复一遍的话。 */
function buildCase(row, kind, list, attr) {
  if (!row || row.childNodes.length) return;
  for (var i = 0; i < list.length; i++) {
    var o = list[i];
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'showcase';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', 'false');
    b.dataset[attr] = o.id;
    b.innerHTML = slotHtml(kind, o);
    row.appendChild(b);
  }
}
buildCase(markRow, 'mark', MARK_STYLES, 'mark');
buildCase(pieceRow, 'piece', PIECE_STYLES, 'piece');

/* ==========================================================
   落地与同步
   ========================================================== */
/* 叉的样式：只改 <html data-mark>，CSS 自己会换画法（不需要重画格子）。
 * 皇后的样式：<html data-piece> 管占位，格子里的画由 board.js 换。
 * 两样都只是「画法」，不碰 state.marks，也不影响存档里的局面。 */
export function applyLook() {
  var root = document.documentElement;
  root.setAttribute('data-mark', settings.markStyle);
  root.setAttribute('data-piece', settings.pieceStyle);
  // 只在真的换了样式时重画格子里的画：新棋盘本来是照当前样式建的，不用再刷一遍
  if (view.lookPiece !== settings.pieceStyle) applyPieceStyle();
  syncLook();
}

export function syncLook() {
  var rows = [
    { row: markRow, kind: 'mark', id: settings.markStyle, list: MARK_STYLES, now: markNow },
    { row: pieceRow, kind: 'piece', id: settings.pieceStyle, list: PIECE_STYLES, now: pieceNow }
  ];
  for (var r = 0; r < rows.length; r++) {
    var cur = rows[r];
    var btns = cur.row ? cur.row.querySelectorAll('.showcase') : [];
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].dataset[cur.kind] === cur.id;
      btns[i].classList.toggle('is-on', on);
      btns[i].setAttribute('aria-checked', on ? 'true' : 'false');
    }
    if (cur.now) cur.now.textContent = '当前：' + styleName(cur.list, cur.id);
  }

  /* 顶栏那颗按钮上挂一颗小黄点：说明「你现在看的是换过的样式」，
   * 不然以后忘了默认长什么样，会以为是坏了。 */
  var custom = settings.markStyle !== MARK_STYLES[0].id ||
    settings.pieceStyle !== PIECE_STYLES[0].id;
  if (btnLook) {
    btnLook.classList.toggle('is-set', custom);
    btnLook.setAttribute('aria-label', custom ? '外观，已换过样式' : '外观');
  }
}

export function pickLook(kind, id) {
  var list = kind === 'mark' ? MARK_STYLES : PIECE_STYLES;
  var key = kind === 'mark' ? 'markStyle' : 'pieceStyle';
  id = styleId(list, id);
  if (settings[key] === id) return;
  settings[key] = id;
  saveSettings();
  applyLook();
  sfx('x');
  buzz(6);
  announce((kind === 'mark' ? '叉改成「' : '皇后改成「') + styleName(list, id) + '」');
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
