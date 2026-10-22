/* ============================================================================
 * history.js
 * 撤销 / 重做：整盘 marks 快照，最多 60 步。
 *
 * 放在 app 层：撤销要判「现在能不能操作」、要收起提示面板、要落盘，
 * 已经不是单纯的视图逻辑了。
 * ========================================================================== */

import { canPlay } from './actions.js';
import { buzz, sfx } from '../core/audio.js';
import { guide, settings, state, view } from '../core/state.js';
import { save } from '../core/storage.js';
import { announce } from '../core/utils.js';
import { closeGuide } from '../ui/guide.js';
import { flashHint } from '../ui/hint.js';
import { render } from '../ui/render.js';

/* ==========================================================
   历史
   ========================================================== */
function snapshot() {
  return {
    marks: state.marks.slice(),
    hints: state.hints,
    moves: state.moves
  };
}

export function pushHistory() {
  view.undo.push(snapshot());
  if (view.undo.length > 60) view.undo.shift();
  view.redo.length = 0;
}

export function undo() {
  if (!canPlay()) return;
  if (settings.noUndo) { lockedHint(); return; }
  if (!view.undo.length) return;
  if (guide.open) closeGuide();
  view.redo.push(snapshot());
  var s = view.undo.pop();
  state.marks = s.marks;
  state.hints = s.hints;
  state.moves = s.moves;
  state.lastTap = null;
  sfx('undo');
  buzz(6);
  render();
  save();
  announce('已撤销');
}

export function redo() {
  if (!canPlay()) return;
  if (settings.noUndo) { lockedHint(); return; }
  if (!view.redo.length) return;
  if (guide.open) closeGuide();
  view.undo.push(snapshot());
  var s = view.redo.pop();
  state.marks = s.marks;
  state.hints = s.hints;
  state.moves = s.moves;
  state.lastTap = null;
  render();
  save();
}

/* 挑战里关掉撤销后，按钮是灰的；键盘 Z 还能按，得给一句话说明为什么没反应 */
function lockedHint() {
  flashHint('挑战模式：这局不能撤销');
  buzz(6);
}
