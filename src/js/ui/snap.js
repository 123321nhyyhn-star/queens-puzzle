/* ============================================================================
 * snap.js · 记录点按钮上的手势
 * ----------------------------------------------------------------------------
 * 一颗按钮三种手势（动作都在 app/snap.js，这里只管「怎么触发」）：
 *   点一下（空着）    → 记下这一刻，按钮翻成墨底的「还原」
 *   点一下（记下了）  → 回到那一刻，记录点用完即清
 *   按住不放（记下了）→ 清空记录点：按住期间描边上一圈红环走满（620ms），
 *                       走满那一刻震一下、提示行说一句「记录点已清空」
 *
 * 右上角那枚「?」只说这三句话 —— 长按这件事在按钮上写不下。
 * 按钮长什么样（字、墨底、能不能按）在 ui/render.js 的 updateStats() 里刷，
 * 这里只在「按下去」的瞬间改 --hold 与 is-holding / is-pop。
 * ========================================================================== */

import { buzz } from '../core/audio.js';
import { btnSnap, btnSnapHelp } from '../core/dom.js';
import { settings, state } from '../core/state.js';
import { announce, pulseClass } from '../core/utils.js';
import { canPlay } from '../app/actions.js';
import { clearSnap, restoreSnap, saveSnap } from '../app/snap.js';
import { flashHint } from './hint.js';

/* 按住多久算「要清空」。太短会跟"点一下"撞车（点了想看还原，结果点掉了），
 * 太长又像没反应；620ms 大约是系统里「长按」的下限。 */
var HOLD_MS = 620;

/* ------------------------------------------------------------ 点一下
 * 按钮与键盘 S 共用这一条：有记录点就还原，没有就记下。
 * 挑战禁用时不接（按钮本来就是灰的，键盘也在这里拦一道）。 */
export function snapTap() {
  if (!canPlay()) return false;
  if (state.noSnap) {
    flashHint('挑战模式：这局不能记下或还原局面');
    buzz(6);
    return false;
  }
  var ok = state.snap ? restoreSnap() : saveSnap();
  if (ok) pulseClass(btnSnap, 'is-pop', 360);
  return ok;
}

/* ------------------------------------------------------------ 接线 */
export function bindSnap() {
  if (!btnSnap) return;

  var raf = 0, t0 = 0, pointerId = null;
  /* 环走满那一下会跟着来一次 click（pointerup 派生的），那一次必须吞掉，
   * 否则「清空」之后立刻又记下了一份。 */
  var swallowClick = false;

  function paint(v) {
    btnSnap.style.setProperty('--hold', v.toFixed(3));
  }

  function stopHold() {
    if (raf) { window.cancelAnimationFrame(raf); raf = 0; }
    pointerId = null;
    btnSnap.classList.remove('is-holding');
    paint(0);
  }

  function tick() {
    var p = Math.min(1, (performance.now() - t0) / HOLD_MS);
    paint(p);
    if (p < 1) { raf = window.requestAnimationFrame(tick); return; }
    raf = 0;
    pointerId = null;
    swallowClick = true;
    window.setTimeout(function () { swallowClick = false; }, 900);
    btnSnap.classList.remove('is-holding');
    paint(0);
    clearSnap();                 // 震动、提示行、存盘都在里面
    pulseClass(btnSnap, 'is-pop', 360);
  }

  btnSnap.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    /* 只有「手上有记录点」的时候才进入长按：空着的时候按住什么也不发生，
     * 环也不出现——那会让人以为按住能记下什么。 */
    if (btnSnap.disabled || state.noSnap || !state.snap) return;
    swallowClick = false;
    pointerId = e.pointerId;
    t0 = performance.now();
    btnSnap.classList.add('is-holding');
    paint(0);
    if (btnSnap.setPointerCapture) {
      try { btnSnap.setPointerCapture(e.pointerId); } catch (err) { /* 老浏览器忽略 */ }
    }
    raf = window.requestAnimationFrame(tick);
  });

  function release(e) {
    if (pointerId == null) return;
    if (e && e.pointerId != null && e.pointerId !== pointerId) return;
    if (btnSnap.hasPointerCapture && btnSnap.hasPointerCapture(pointerId)) {
      try { btnSnap.releasePointerCapture(pointerId); } catch (err) { /* 忽略 */ }
    }
    /* 没到点就松手：环收回去，接着照常走 click（慢一点的点按还是点按） */
    stopHold();
  }

  btnSnap.addEventListener('pointerup', release);
  btnSnap.addEventListener('pointercancel', release);
  // 手指按住不放时别弹系统菜单
  btnSnap.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  btnSnap.addEventListener('click', function () {
    if (swallowClick) { swallowClick = false; return; }
    snapTap();
  });

  /* ---- 右上角的「?」 ----
   * 三句话都写在屏幕最上方的提示行里，而「?」在底部工具栏，中间隔着一整块棋盘。
   * 光把字摆上去不够：视线还停在手指上。所以三处都带上 `from`，让光点从
   * 这颗角标飞过去（ui/hint-focus.js），角标自己再荡一圈涟漪确认「按到了」。 */
  if (btnSnapHelp) {
    btnSnapHelp.addEventListener('click', function () {
      var opt = { from: btnSnapHelp };
      pulseClass(btnSnapHelp, 'is-ping', 480);
      if (state.noSnap) {
        flashHint('挑战模式：这局不能记下或还原局面', false, 2600, opt);
        return;
      }
      if (state.status !== 'playing') {
        flashHint('这局已经结束，记录点留给下一局', false, 2600, opt);
        return;
      }
      flashHint(state.snap
        ? '再点「还原」回到记下的那一刻 · 按住不放清空'
        : '点一下记下这一刻 · 再点一下还原 · 按住不放清空', true, 3200, opt);
      announce('记录点：点一下记下，再点一下还原，按住不放清空');
    });
  }
}
