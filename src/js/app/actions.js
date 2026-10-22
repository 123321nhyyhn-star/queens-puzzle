/* ============================================================================
 * actions.js
 * 玩家动作：点格子的语义（标 × / 取消 / 双击放皇后）、落子、清空。
 * ========================================================================== */

import { buzz, sfx } from '../core/audio.js';
import { startTimer } from '../core/clock.js';
import { guide, state, view } from '../core/state.js';
import { save } from '../core/storage.js';
import { announce } from '../core/utils.js';
import { closeGuide } from '../ui/guide.js';
import { clearHintTimer, flashHint } from '../ui/hint.js';
import { pushHistory } from './history.js';
import { render } from '../ui/render.js';
import { checkWin } from '../ui/win.js';

/* ==========================================================
   落子 / 标记
   ========================================================== */
export function canPlay() {
  return state.status === 'playing' && !view.sheetOpen && !view.diffOpen && !view.resultOpen;
}

export function setMarks(next, anim) {
  state.marks = next;
  render(anim);
  save();
  checkWin();
}

export function onCell(i) {
  if (!canPlay()) return;
  // 玩家自己动手了，之前那张提示的圈就撤掉，免得指着一处已经变了的棋盘
  if (guide.open) closeGuide();
  // Tab 位跟着最后一次操作的格子走
  if (view.cells[i] && view.cells[i].tabIndex !== 0) {
    for (var k = 0; k < view.cells.length; k++) view.cells[k].tabIndex = k === i ? 0 : -1;
  }
  var now = performance.now();
  var last = state.lastTap;

  // 双击：撤销第一次点击的效果，直接放皇后
  if (last && last.i === i && (now - last.t) < 340) {
    state.lastTap = null;
    state.marks[i] = last.prev;
    if (!last.pushed) pushHistory();
    placeQueen(i, true);
    return;
  }

  var prev = state.marks[i];

  if (state.marks[i] === 2) {
    pushHistory();
    state.marks[i] = 0;
    sfx('remove');
    buzz(6);
    state.lastTap = null;
    setMarks(state.marks);
    announce('已移除皇后');
    return;
  }

  if (state.marks[i] === 1) {
    pushHistory();
    state.marks[i] = 0;
    sfx('xOff');
    state.lastTap = { i: i, t: now, prev: prev, pushed: true };
    setMarks(state.marks);
    return;
  }

  if (state.auto && state.auto[i]) {
    buzz(3);
    flashHint('这一格已被自动打叉，双击可以直接放皇后');
    state.lastTap = { i: i, t: now, prev: 0, pushed: false };
    return;
  }

  pushHistory();
  state.marks[i] = 1;
  startTimer();
  sfx('x');
  buzz(5);
  state.lastTap = { i: i, t: now, prev: prev, pushed: true };
  setMarks(state.marks);
}

export function placeQueen(i, skipHistory) {
  if (!skipHistory) pushHistory();
  if (guide.open) closeGuide();
  clearHintTimer();
  state.marks[i] = 2;
  state.moves++;
  startTimer();
  sfx('queen');
  buzz([10, 24, 14]);
  setMarks(state.marks, { from: i });
  announce('已放置皇后');
}

export function clearBoard(silent) {
  if (!canPlay()) return;
  if (guide.open) closeGuide();
  pushHistory();
  state.marks.fill(0);
  state.lastTap = null;
  sfx('xOff');
  buzz(8);
  setMarks(state.marks);
  if (!silent) flashHint('已清空，可撤销');
  announce('已清空棋盘');
}
