/* ============================================================================
 * snap.js · 记录点（记下这一刻 / 还原 / 清空）
 * ----------------------------------------------------------------------------
 * 手动假设推演最难的地方不是推，是**推着推着忘了棋盘原来长什么样**。
 * 这颗按钮就干一件事：把这一刻的整盘 marks 抄一份存着，推歪了再点一下就回来。
 *
 * 三条规矩：
 *   · 只留一份。记下了按钮就是「还原」，还原一次就用掉、回到「记录」
 *     ——「存 / 取 / 存 / 取」交替，不用去选「这是第几号记录点」。
 *   · 还原占**一个撤销位**（走 app/history.js 的 pushRestorePoint），
 *     但**不算一步**：它没有往棋盘上落笔，撤销一下就能退回去。
 *   · 存的是 marks + hints + moves，跟撤销快照同一份口径；跟随存档落盘，
 *     刷新页面回来还认得那一刻（撤销栈则根本不落盘）。
 *
 * 动作在这里（跟 app/ 其它文件一样只管流程与落盘），按钮长什么样在
 * ui/render.js 的 updateStats()，手势（点 / 长按）在 ui/snap.js。
 * ========================================================================== */

import { buzz, sfx } from '../core/audio.js';
import { guide, state } from '../core/state.js';
import { save } from '../core/storage.js';
import { announce } from '../core/utils.js';
import { closeGuide } from '../ui/guide.js';
import { clearHintTimer, flashHint } from '../ui/hint.js';
import { render } from '../ui/render.js';
import { canPlay } from './actions.js';
import { pushRestorePoint } from './history.js';

/* ------------------------------------------------------------ 记下这一刻
 * 只读棋盘：不压撤销点、不涨步数、不动任何格子，也不收起引导面板
 * （棋盘没变，指着它的那些圈还成立）。记完按钮翻成「还原」。 */
export function saveSnap() {
  if (!canPlay()) return false;
  if (state.snap) return false;      // 已经有了：按钮这一下该走「还原」
  state.snap = {
    marks: state.marks.slice(),      // 拷一份，之后棋盘怎么变都不影响它
    hints: state.hints,
    moves: state.moves
  };
  sfx('snap');
  buzz(10);
  render();
  save();
  flashHint('已记下这一刻 · 再点就是「还原」', true, 2000);
  announce('已记下这一刻');
  return true;
}

/* ------------------------------------------------------------ 还原
 * 回到记下的那一刻：占一个撤销位（撤销能退回还原之前），不算一步。
 * 记录点用完即清 —— 一次只能存一个，取走就空了。 */
export function restoreSnap() {
  if (!canPlay()) return false;
  var s = state.snap;
  if (!s) return false;
  if (guide.open) closeGuide();
  clearHintTimer();

  pushRestorePoint();
  state.marks = s.marks.slice();     // 同样拷一份：存的那盘不能被棋盘改掉
  state.hints = s.hints;
  state.moves = s.moves;
  state.lastTap = null;
  state.snap = null;

  sfx('restore');
  buzz([12, 26, 12]);
  render();
  save();
  flashHint('已回到记录点 · 撤销可退回', true, 2000);
  announce('已回到记录点');
  return true;
}

/* ------------------------------------------------------------ 清空
 * 长按按钮（ui/snap.js）与 Shift+S 都走这里。棋盘一个字都不动，
 * 只是把存着的那份丢掉，按钮回到「记录」。
 * 不要求 canPlay：这局封盘了也允许把记录点扔掉（它已经没用了）。 */
export function clearSnap(silent) {
  if (!state.snap) return false;
  state.snap = null;
  buzz([18, 40, 18, 40, 26]);
  render();
  save();
  if (!silent) flashHint('记录点已清空');
  announce('记录点已清空');
  return true;
}
