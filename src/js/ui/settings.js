/* ============================================================================
 * settings.js
 * 设置面板：尺寸 / 难度只写 pending，开关即时生效，换一局才落地。
 * ========================================================================== */

import { buzz, sfx } from '../core/audio.js';
import { DIFF_BANDS, SIZE_MAX, SIZE_MIN } from '../core/config.js';
import { app, btnAuto, btnSettings, btnShuffle, diffHint, diffOpts, quickRow, sheet,
  sheetNote, sheetWrap, shuffleHint, sizeMinus, sizePlus, sizeStepperEl, sizeVal, swAuto,
  swConflict, swForced, swHaptics, swSound } from '../core/dom.js';
import { pending, settings, state, view } from '../core/state.js';
import { saveSettings } from '../core/storage.js';
import { clamp } from '../core/utils.js';
import { flashHint } from './hint.js';
import { render } from './render.js';
import { refreshShareCode } from './share.js';

/* ==========================================================
   设置面板
   ========================================================== */
export function syncAutoBtn() {
  var on = !!settings.autoMark;
  btnAuto.classList.toggle('is-on', on);
  btnAuto.setAttribute('aria-pressed', on ? 'true' : 'false');
  btnAuto.setAttribute('aria-label', on ? '自动打叉，已开启' : '自动打叉，已关闭');
}

export function toggleAuto() {
  settings.autoMark = !settings.autoMark;
  saveSettings();
  syncAutoBtn();
  if (view.sheetOpen) syncSheet();
  render(true);
  if (settings.autoMark) {
    sfx('auto');
    buzz(8);
    flashHint('自动打叉已开启');
  } else {
    sfx('xOff');
    buzz(6);
    flashHint('自动打叉已关闭，只显示你手动标的 ×');
  }
}

/* 面板上半部分（尺寸 / 难度）只写 pending，不碰正在玩的这一局 */
export function syncSheet() {
  var diff = pending.difficulty;
  var target = diff && diff !== 'any' ? diff : null;
  var band = target ? DIFF_BANDS[target] : null;

  sizeVal.textContent = String(pending.size);
  sizeMinus.disabled = pending.size <= SIZE_MIN;
  sizePlus.disabled = pending.size >= SIZE_MAX;

  // 目标难度接管尺寸，手动改尺寸没有意义
  sizeStepperEl.classList.toggle('diff-locked', !!target);
  quickRow.classList.toggle('diff-locked', !!target);

  sheetNote.textContent = '当前这局：' + state.size + '×' + state.size +
    (state.vibe ? ' · ' + state.vibe.level + ' ' + state.vibe.score.toFixed(1) : '');

  diffHint.textContent = target
    ? '「' + band.name + '」＝ ' + band.lo + '×' + band.lo + '–' + band.hi + '×' + band.hi + '，每局随机一档'
    : '选好档位，点下面「换一局」生效';

  var dbtns = diffOpts.querySelectorAll('.dbtn');
  for (var d = 0; d < dbtns.length; d++) {
    var on = dbtns[d].dataset.level === diff;
    dbtns[d].classList.toggle('is-on', on);
    dbtns[d].setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  swAuto.setAttribute('aria-checked', settings.autoMark ? 'true' : 'false');
  swConflict.setAttribute('aria-checked', settings.conflict ? 'true' : 'false');
  swForced.setAttribute('aria-checked', settings.forced ? 'true' : 'false');
  swSound.setAttribute('aria-checked', settings.sound ? 'true' : 'false');
  swHaptics.setAttribute('aria-checked', settings.haptics ? 'true' : 'false');
  syncAutoBtn();

  var chips = quickRow.querySelectorAll('.qbtn');
  for (var i = 0; i < chips.length; i++) {
    chips[i].classList.toggle('is-on', parseInt(chips[i].dataset.size, 10) === pending.size);
  }

  syncShuffleRow();
}

/* 换一局按钮下方的说明：有改动没落地就把改动列出来，顺带把按钮点亮 */
export function syncShuffleRow() {
  var bits = [];
  if (!pending.difficulty || pending.difficulty === 'any') {
    if (pending.size !== state.size) bits.push(pending.size + '×' + pending.size);
  }
  if (pending.difficulty !== state.diffApplied) {
    bits.push(pending.difficulty === 'any'
      ? '不限难度'
      : DIFF_BANDS[pending.difficulty].name);
  }

  var hasPending = bits.length > 0;
  btnShuffle.classList.toggle('is-pending', hasPending);
  shuffleHint.classList.toggle('is-pending', hasPending);
  shuffleHint.textContent = hasPending
    ? '点这里生效：' + bits.join(' · ')
    : '换一幅新棋盘，上面的棋盘大小与目标难度一起生效';
}

export function openSheet() {
  if (view.sheetOpen) return;
  view.sheetOpen = true;
  // 每次打开都从「这一局实际是什么」重新起算，上次没落地的改动就作废
  pending.size = state.size;
  pending.difficulty = state.diffApplied || settings.difficulty;
  syncSheet();
  sheetWrap.hidden = false;
  refreshShareCode();   // 露出后再量高度，长代码才能自动撑开
  if ('inert' in HTMLElement.prototype) app.inert = true;
  else app.setAttribute('aria-hidden', 'true');
  btnSettings.setAttribute('aria-expanded', 'true');
  sheet.focus();
}

export function closeSheet() {
  if (!view.sheetOpen) return;
  view.sheetOpen = false;
  sheetWrap.hidden = true;
  if ('inert' in HTMLElement.prototype) app.inert = false;
  app.removeAttribute('aria-hidden');
  btnSettings.setAttribute('aria-expanded', 'false');
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}

export function setPendingSize(n) {
  if (pending.difficulty && pending.difficulty !== 'any') return;  // 目标难度接管尺寸
  n = clamp(n, SIZE_MIN, SIZE_MAX);
  if (n === pending.size) return;
  pending.size = n;
  syncSheet();
}

export function trapFocus(e, container) {
  var all = container.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  // 只把真正能看见的算进来，避免 Tab 停在隐藏元素上
  var items = [];
  for (var i = 0; i < all.length; i++) {
    if (all[i].getClientRects().length) items.push(all[i]);
  }
  if (!items.length) return;
  var first = items[0];
  var last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}
