/* ============================================================================
 * hint-focus.js · 把「刚点的那个东西」和「顶部那句话」连起来
 * ----------------------------------------------------------------------------
 * 需要它的场合只有一种：**触发点在屏幕下部，而话出现在屏幕上方**。
 * 记录点右上角那枚「?」就是典型 —— 它贴着底部工具栏，提示行却在棋盘上方，
 * 中间隔着 400px 的棋盘。点完什么都不做的话，手指底下只有一次 1px 的位移，
 * 眼睛根本不会往上走，人只会觉得「点了没反应」。
 *
 * 所以这里做两件事，让目光自己跟上去：
 *   1. 从点击点飞一颗光点过去（380ms，微微上扬的弧线）——先给出「出事了，在那边」
 *   2. 落点那一刻，提示行从模糊放大收到清晰（400ms）——再给出「就是这句话」
 *
 * 光点是临时节点：position:fixed 挂在 body 上，动画结束就 remove()。
 * 不给提示行加类、不占布局，所以棋盘一格都不会挪。
 *
 * prefers-reduced-motion 时整段跳过：文字本身已经在那里了，
 * 强行位移只会让前庭敏感的人难受。
 * ========================================================================== */

import { hintEl, hintRowEl } from '../core/dom.js';

/* 光点飞到的时间。再短就看不清轨迹，再长会让人觉得卡。 */
var FLY_MS = 380;
/* 文字从糊到清的时间：跟光点同时起跑、同时到位，
 * 不然「等一下才有反应」的观感会回来。 */
var FOCUS_MS = 400;

/* 每次现读，不缓存：系统里中途改「减少动效」不该要求刷新页面才认。
 * 这条只在点「?」时跑一次，matchMedia 的开销可以忽略。 */
function prefersReduce() {
  return !!(window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/* 上一轮还在跑的话先收掉：连点两下「?」不该叠出两颗光点。
 * 文字那一段让浏览器自己取消（同一个元素上再 animate 会替换掉旧的）。 */
var live = null;
var rowAnim = null;

function clean() {
  if (live) { live.remove(); live = null; }
}

/**
 * 从 fromEl 向提示行飞一颗光点，并让提示文字「对上焦」。
 *
 * @param {Element} fromEl 触发这次提示的元素（点在哪就从哪起飞）
 * @param {boolean} ok     提示是「好」的那一类还是「不行」的那一类，只影响光点颜色
 */
export function focusHint(fromEl, ok) {
  if (prefersReduce() || !fromEl || !hintEl || !hintRowEl) return;

  /* 提示行被藏起来的时候（引导层盖着整屏）飞过去是一颗对着空气的光点 */
  var b = hintEl.getBoundingClientRect();
  if (b.width < 2 || b.height < 2) return;
  if (window.getComputedStyle(hintRowEl).visibility === 'hidden') return;

  var a = fromEl.getBoundingClientRect();
  if (a.width < 2 || a.height < 2) return;

  var from = { x: a.left + a.width / 2, y: a.top + a.height / 2 };
  var to = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  var dx = to.x - from.x;
  var dy = to.y - from.y;

  /* 太近就不飞了（比如将来把「?」挪到提示行旁边），横向位移也不值得引导 */
  if (Math.abs(dy) < 48) return;

  clean();

  var dot = document.createElement('span');
  dot.className = 'hint-flare' + (ok ? ' is-ok' : ' is-alert');
  dot.setAttribute('aria-hidden', 'true');
  dot.style.left = from.x + 'px';
  dot.style.top = from.y + 'px';
  document.body.appendChild(dot);
  live = dot;

  /* 中途往上多抬 22px：直线看起来是「被吸过去」，抬一点才像「扔上去」，
   * 落点也更稳。dy 是负数（往上走），减 22 就是更高。 */
  var arc = dy * 0.55 - 22;
  var anim = dot.animate([
    { transform: 'translate(-50%,-50%) scale(.3)', opacity: 0, offset: 0 },
    { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: .1 },
    {
      transform: 'translate(calc(-50% + ' + (dx * 0.55).toFixed(1) + 'px), calc(-50% + '
        + arc.toFixed(1) + 'px)) scale(1.02)',
      opacity: .95, offset: .62
    },
    {
      transform: 'translate(calc(-50% + ' + dx.toFixed(1) + 'px), calc(-50% + '
        + dy.toFixed(1) + 'px)) scale(.5)',
      opacity: 0, offset: 1
    }
    /* 缓动必须是「先加速、后减速」那一路。用弹簧类的前载曲线试过：
     * 40ms 就走完 28%、130ms 走完 84%，后半程等于贴着文字飘，
     * 轨迹根本读不出来，只剩「闪了一下」。 */
  ], { duration: FLY_MS, easing: 'cubic-bezier(.4,0,.2,1)' });

  anim.onfinish = anim.oncancel = function () {
    if (live === dot) live = null;
    dot.remove();
  };

  /* 文字这一段：起点留一点透明度（.4），让人立刻看见「上面有字了」，
   * 但它还是糊的、还在放大；跟着光点一起收到清晰。
   * 用 hint-row 而不是 .hint 本身 —— .hint 有 overflow:hidden（两行截断），
   * 在它身上加 blur 会把字边裁掉，而行本身是透明背景、高度 36px，放大不吃亏。 */
  if (rowAnim) rowAnim.cancel();
  rowAnim = hintRowEl.animate([
    { filter: 'blur(3.2px)', opacity: .45, transform: 'scale(1.06)' },
    { filter: 'blur(0px)', opacity: 1, transform: 'scale(1)' }
  ], { duration: FOCUS_MS, easing: 'cubic-bezier(.22,.8,.2,1)' });
  rowAnim.onfinish = rowAnim.oncancel = function () { rowAnim = null; };
}
