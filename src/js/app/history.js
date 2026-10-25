/* ============================================================================
 * history.js
 * 撤销 / 重做：整盘 marks 快照，最多 UNDO_MAX 步（core/state.js）。
 *
 * 放在 app 层：撤销要判「现在能不能操作」、要收起提示面板、要落盘，
 * 已经不是单纯的视图逻辑了。
 * ========================================================================== */

import { canPlay } from './actions.js';
import { buzz, sfx } from '../core/audio.js';
import { guide, settings, state, UNDO_MAX, view } from '../core/state.js';
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

function pushEntry() {
  view.undo.push(snapshot());
  if (view.undo.length > UNDO_MAX) view.undo.shift();
  view.redo.length = 0;
}

export function pushHistory() {
  pushEntry();
  /* 步数在这里涨：一次落笔 = 一步（拖动连涂一整行也只走这一处，所以算一步）。
   * 只增不减——撤销 / 重做是「回到走过的位置」，不是又走了一步；
   * 所以这个数跟撤销栈的深度不是一回事（栈还有 UNDO_MAX 封顶、刷新后会清空）。 */
  state.steps++;
}

/* 记录点的「还原」走的也是这一条：**占一个撤销位，但不算一步**。
 * 它没有往棋盘上落笔，跟撤销 / 重做是同一类动作（回到走过的位置），
 * 所以走 pushEntry 而不是 pushHistory —— 开了步数限制的局不该因为
 * 「回到记下的那一刻」被罚掉一步。 */
export function pushRestorePoint() {
  pushEntry();
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
