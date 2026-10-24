/* ============================================================================
 * lives.js · 挑战「标错惩罚」的命数指示
 * ----------------------------------------------------------------------------
 * 只做三件事：把命画出来、扣命时放动效、把「放错的那一格」闪一下红 X。
 * 判错、扣命、判负的时机不在这里：
 *
 *   · 哪一格算错 —— game/rules.js 的 isSolutionCell()
 *   · 什么时候扣 —— app/actions.js 的 placeQueen()（放不进去就不落子）
 *   · 扣光了判负 —— ui/win.js 的 failByLives()
 *
 * 这里只管「画」。命数本身存在 state.lives / state.lifeLimit（跟着存档走），
 * 本模块不另存一份，只记「界面上现在画着几条」用来判断要不要重建 DOM。
 *
 * 一条指示里同时有红心与血条两套画法（index.html 的 #livesRow），
 * 显示哪一套由 <html data-life> 决定（外观面板，见 looks/life.js）。
 * 两套共用同一份数据：--life-ratio 给血条的宽度，.is-lost 给红心的碎样。
 * 这样换样式只是 CSS 换一幅画，不用重建节点，也不会把正在播的那一下打回去。
 * ========================================================================== */

import { buzz, sfx } from '../core/audio.js';
import { REDUCE_MOTION } from '../core/config.js';
import { lifeHearts, lifeTicks, livesEl, livesRow } from '../core/dom.js';
import { state, view } from '../core/state.js';
import { save } from '../core/storage.js';
import { announce, pulseClass } from '../core/utils.js';
import { HEART_SVG } from '../looks/life.js';

var built = 0;          // 界面上现在画着几条命（0 = 没建 / 惩罚没开）

/* 血条上的刻度：N 条命就是 N-1 道竖线，等分整条槽。
 * 单独建一层，压在填充之上——填充是从左往右缩的，刻度得一直看得见。 */
function build(limit) {
  var hearts = '';
  for (var i = 0; i < limit; i++) hearts += '<i class="heart">' + HEART_SVG + '</i>';
  lifeHearts.innerHTML = hearts;

  var ticks = '';
  for (var k = 1; k < limit; k++) {
    ticks += '<i style="left:' + (100 * k / limit).toFixed(3) + '%"></i>';
  }
  lifeTicks.innerHTML = ticks;
  built = limit;
}

/* 把 state 上的命数画到界面上。渲染、换盘、重试、读档之后都会走一遍——
 * 这里**不播动画**：碎心是「刚刚失去的那一下」，只在 loseLife 里点名触发。 */
export function syncLives() {
  if (!livesRow || !livesEl) return;
  var limit = state.lifeLimit > 0 ? state.lifeLimit : 0;
  if (!limit) {
    livesRow.hidden = true;
    livesEl.classList.remove('is-low', 'is-hit', 'is-empty');
    return;
  }
  livesRow.hidden = false;
  if (built !== limit) build(limit);

  var lives = Math.max(0, Math.min(limit, state.lives | 0));
  var hearts = lifeHearts.children;
  for (var i = 0; i < hearts.length; i++) {
    /* is-lost 每颗各自认账：正在演「碎开」的那颗也带着它，
     * 动画跑完就是它该待的样子，不用另外照顾。 */
    hearts[i].classList.toggle('is-lost', i >= lives);
  }
  livesEl.style.setProperty('--life-ratio', (lives / limit).toFixed(4));
  livesEl.classList.toggle('is-low', lives === 1 && state.status === 'playing');
  livesEl.classList.toggle('is-empty', lives === 0);
  livesEl.setAttribute('aria-label', '还剩 ' + lives + ' 条命，共 ' + limit + ' 条');
}

/* 失去的那一颗：加一下 is-broken 让 CSS 把心拆开、往两边倒。
 * 用 pulseClass 而不是自己记计时器：连着丢两条命时，两颗心各演各的，
 * 前一颗不会被后一颗的计时器半路摘掉类名。 */
function breakHeart(index) {
  var hearts = lifeHearts ? lifeHearts.children : null;
  var h = hearts && hearts[index];
  if (h) pulseClass(h, 'is-broken', 900);
}

/* 放错的那一格：红 X 拍上去、自己缩掉。格子本身不写 marks——
 * 这一手压根没落成，棋盘上要留着原来那个样子（多半是空的）。
 * 用 pulseClass 而不是直接 classList.add：连着放错同一格时能重播。 */
function flashMiss(i) {
  var cell = view.cells[i];
  if (!cell) return;
  pulseClass(cell, 'is-miss', REDUCE_MOTION ? 460 : 800);
}

/* 扣一条命。返回还剩几条（0 = 该判负了，由调用方决定谁去封盘）。
 * 惩罚没开时直接返回 0，不会有人误扣。 */
export function loseLife(i) {
  if (!(state.lifeLimit > 0)) return 0;
  state.lives = Math.max(0, (state.lives || 0) - 1);

  syncLives();
  breakHeart(state.lives);          // 失去的是从左数第 lives 颗（0 起）
  if (livesEl) pulseClass(livesEl, 'is-hit', 620);
  flashMiss(i);

  sfx('miss');
  /* 震动比别的动静都长一点：这一下是惩罚，得让手也记住 */
  buzz([30, 46, 30, 46, 70]);

  announce(state.lives > 0
    ? '放错了，这一格不是皇后的位置，还剩 ' + state.lives + ' 条命'
    : '放错了，命用完了');
  save();
  return state.lives;
}
