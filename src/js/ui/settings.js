/* ============================================================================
 * settings.js
 * 设置面板：尺寸 / 难度 / 挑战只写 pending，点「换一局」才落地；其余开关即时生效。
 * ========================================================================== */

import { DIFF_BANDS, LIMIT_OPTIONS, limitLabel, normalizeLimit, SIZE_MAX, SIZE_MIN } from '../core/config.js';
import { app, btnSettings, btnShuffle, challengeTitle, diffHint, diffOpts, limitHint,
  limitOpts, quickRow, sheet, sheetNote, sheetWrap, shuffleHint, sizeMinus, sizePlus,
  sizeStepperEl, sizeVal, swAuto, swConflict, swForced, swHaptics, swNoHint, swNoUndo,
  swSound } from '../core/dom.js';
import { pending, settings, state, view } from '../core/state.js';
import { saveSettings } from '../core/storage.js';
import { announce, clamp } from '../core/utils.js';
import { refreshShareCode } from './share.js';

/* ==========================================================
   挑战：限时挡位
   ----------------------------------------------------------
   按钮按 LIMIT_OPTIONS 生成，省得配置和面板各写一份、改一边忘另一边。
   ========================================================== */
function buildLimitOpts() {
  if (!limitOpts || limitOpts.childNodes.length) return;
  for (var i = 0; i < LIMIT_OPTIONS.length; i++) {
    var o = LIMIT_OPTIONS[i];
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'lbtn';
    b.dataset.limit = String(o.ms);
    b.textContent = o.label;
    b.setAttribute('aria-pressed', 'false');
    limitOpts.appendChild(b);
  }
}
buildLimitOpts();

/* 挑战只写 pending，跟棋盘大小 / 目标难度一个规矩：点「换一局」才落地。
 * 中途改完不换局就等于没改——开了限时又反悔，也不用担心这局被计时追着跑。 */
export function setPendingLimit(ms) {
  ms = normalizeLimit(ms);
  if (ms === pending.timeLimit) return;
  pending.timeLimit = ms;
  syncSheet();
  announce('限时：' + (ms ? limitLabel(ms) : '不限') + '（换一局后生效）');
}

/* 这一组里有哪些还没落地的改动，给「换一局」下方的说明与读屏播报共用 */
function challengeBits() {
  var bits = [];
  if ((pending.timeLimit || 0) !== (settings.timeLimit || 0)) {
    bits.push(pending.timeLimit ? '限时 ' + limitLabel(pending.timeLimit) : '不限时');
  }
  if (!!pending.noHint !== !!settings.noHint) {
    bits.push(pending.noHint ? '禁用提示' : '提示可用');
  }
  if (!!pending.noUndo !== !!settings.noUndo) {
    bits.push(pending.noUndo ? '禁用撤销' : '撤销可用');
  }
  return bits;
}

export function challengeSummary() {
  return challengeBits().join(' · ');
}

/* 换一局时把挑战的意向落到设置上：这是它唯一生效的时机 */
export function commitChallenge() {
  settings.timeLimit = normalizeLimit(pending.timeLimit);
  settings.noHint = !!pending.noHint;
  settings.noUndo = !!pending.noUndo;
  saveSettings();
}

/* ==========================================================
   设置面板
   ========================================================== */
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
    (state.vibe ? ' · ' + state.vibe.level + ' ' + state.vibe.score.toFixed(1) : '') +
    (state.limit ? ' · 限时 ' + limitLabel(state.limit) : '');

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

  /* ---- 挑战（只写 pending，点「换一局」才生效） ---- */
  var lim = pending.timeLimit || 0;
  var applied = settings.timeLimit || 0;
  var lbtns = limitOpts.querySelectorAll('.lbtn');
  for (var l = 0; l < lbtns.length; l++) {
    var lon = parseInt(lbtns[l].dataset.limit, 10) === lim;
    lbtns[l].classList.toggle('is-on', lon);
    lbtns[l].setAttribute('aria-pressed', lon ? 'true' : 'false');
  }
  limitHint.textContent = lim !== applied
    ? '换一局后生效：' + (lim ? '限时 ' + limitLabel(lim) : '不限时')
    : (lim ? '本局限时 ' + limitLabel(lim) + '，超时判负，可以重试这一局'
        : '开启后第一次操作开始倒计时，超时判负');
  swNoHint.setAttribute('aria-checked', pending.noHint ? 'true' : 'false');
  swNoUndo.setAttribute('aria-checked', pending.noUndo ? 'true' : 'false');

  // 有没落地的改动就把组标题点亮，别让人以为已经生效了
  var cbits = challengeBits();
  if (challengeTitle) {
    challengeTitle.textContent = cbits.length ? '挑战 · 待换一局生效' : '挑战';
    challengeTitle.classList.toggle('is-pending', cbits.length > 0);
  }

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
  bits = bits.concat(challengeBits());

  var hasPending = bits.length > 0;
  btnShuffle.classList.toggle('is-pending', hasPending);
  shuffleHint.classList.toggle('is-pending', hasPending);
  shuffleHint.textContent = hasPending
    ? '点这里生效：' + bits.join(' · ')
    : '换一幅新棋盘，上面的棋盘大小、目标难度与挑战一起生效';
}

export function openSheet() {
  if (view.sheetOpen) return;
  view.sheetOpen = true;
  // 每次打开都从「这一局实际是什么」重新起算，上次没落地的改动就作废
  pending.size = state.size;
  pending.difficulty = state.diffApplied || settings.difficulty;
  pending.timeLimit = settings.timeLimit || 0;
  pending.noHint = !!settings.noHint;
  pending.noUndo = !!settings.noUndo;
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
