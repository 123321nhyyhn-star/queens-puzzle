/* ============================================================================
 * settings.js
 * 设置面板：尺寸 / 难度 / 挑战只写 pending，点「换一局」才落地；其余开关即时生效。
 * ========================================================================== */

import { DIFF_BANDS, LIMIT_OPTIONS, limitLabel, normalizeLimit, SIZE_MAX, SIZE_MIN } from '../core/config.js';
import { app, btnMoreOpts, btnSettings, btnShuffle, challengeTitle, diffHint, diffOpts, limitHint,
  limitOpts, moreOptsLabel, quickRow, sheet, sheetMore, sheetNote, sheetWrap, shuffleHint,
  sizeHint, sizeMinus, sizePlus, sizeVal, swAlignDrag, swAuto, swConflict, swFadeMark,
  swFadeQueen, swForced, swHaptics, swNoHint, swNoUndo, swSound } from '../core/dom.js';
import { pending, settings, state, view } from '../core/state.js';
import { saveSettings } from '../core/storage.js';
import { announce, clamp } from '../core/utils.js';
import { fitShareCode, refreshShareCode } from './share.js';

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
/* 档位开放给玩家的尺寸区间。没选档位就是全量 4–16。
 * 这不是「限制」，是实测出来的可达性：4×4 里不存在困难的盘，
 * 16×16 也不会是容易的，把够不着的组合收起来比让人选完失望好。 */
function rangeOf(level) {
  var b = level && level !== 'any' ? DIFF_BANDS[level] : null;
  return b ? [b.lo, b.hi] : [SIZE_MIN, SIZE_MAX];
}

/* 「不限」时给几个常用尺寸；选了档位就把这一档开放的尺寸全摊开 */
var QUICK_ANY = [6, 8, 10, 12, 15];
var quickKey = '';

function buildQuickRow(lo, hi) {
  var key = lo + '-' + hi;
  if (key === quickKey) return;
  quickKey = key;

  var all = lo === SIZE_MIN && hi === SIZE_MAX;
  var sizes = all ? QUICK_ANY : [];
  for (var i = lo; !all && i <= hi; i++) sizes.push(i);

  var html = '<span class="q-label">' + (all ? '常用' : '可选') + '</span>';
  for (var k = 0; k < sizes.length; k++) {
    html += '<button class="qbtn" type="button" data-size="' + sizes[k] + '">' +
      sizes[k] + '×' + sizes[k] + '</button>';
  }
  quickRow.innerHTML = html;
}

export function syncSheet() {
  var diff = pending.difficulty;
  var target = diff && diff !== 'any' ? diff : null;
  var band = target ? DIFF_BANDS[target] : null;
  var rng = rangeOf(target);
  var lo = rng[0], hi = rng[1];

  /* 换了档位就把待生效尺寸夹回它开放的区间：选完「极难」还挂着 8×8 是要闹哪样 */
  pending.size = clamp(pending.size, lo, hi);

  sizeVal.textContent = String(pending.size);
  sizeMinus.disabled = pending.size <= lo;
  sizePlus.disabled = pending.size >= hi;
  buildQuickRow(lo, hi);

  /* 两行各说一件事，别重复：尺寸那行说「这一档能挑多大」，
   * 难度那行说「这一档的分数从哪儿起」+ 什么时候生效。 */
  sizeHint.textContent = band
    ? '「' + band.name + '」开放 ' + lo + '×' + lo + '–' + hi + '×' + hi
    : '4×4 到 16×16，每盘唯一解';

  sheetNote.textContent = '当前这局：' + state.size + '×' + state.size +
    (state.vibe ? ' · ' + state.vibe.level + ' ' + state.vibe.score.toFixed(1) : '') +
    (state.limit ? ' · 限时 ' + limitLabel(state.limit) : '');

  diffHint.textContent = band
    ? '「' + band.name + '」' + (band.min > 0 ? band.min.toFixed(1) + ' 分起 · ' : '') +
      '挑好尺寸，点「换一局」生效'
    : '选好档位，再挑一个尺寸，点下面「换一局」生效';

  var dbtns = diffOpts.querySelectorAll('.dbtn');
  for (var d = 0; d < dbtns.length; d++) {
    var on = dbtns[d].dataset.level === diff;
    dbtns[d].classList.toggle('is-on', on);
    dbtns[d].setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  swAuto.setAttribute('aria-checked', settings.autoMark ? 'true' : 'false');
  swAlignDrag.setAttribute('aria-checked', settings.alignDrag ? 'true' : 'false');
  swFadeMark.setAttribute('aria-checked', settings.fadeMark ? 'true' : 'false');
  swFadeQueen.setAttribute('aria-checked', settings.fadeQueen ? 'true' : 'false');
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
  var any = !pending.difficulty || pending.difficulty === 'any';
  if (any) {
    if (pending.size !== state.size) bits.push(pending.size + '×' + pending.size);
    if (state.diffApplied && state.diffApplied !== 'any') bits.push('不限难度');
  } else if (pending.difficulty !== state.diffApplied || pending.size !== state.size) {
    // 档位和尺寸现在是一起选的：哪一项变了都说清楚，别只报档位
    bits.push(DIFF_BANDS[pending.difficulty].name + ' ' + pending.size + '×' + pending.size);
  }
  bits = bits.concat(challengeBits());

  var hasPending = bits.length > 0;
  btnShuffle.classList.toggle('is-pending', hasPending);
  shuffleHint.classList.toggle('is-pending', hasPending);
  shuffleHint.textContent = hasPending
    ? '点这里生效：' + bits.join(' · ')
    : '换一幅新棋盘，上面的棋盘大小、目标难度与挑战一起生效';
}

/* ==========================================================
   「显示更多选项」
   ----------------------------------------------------------
   默认只摊开「换一局」和它上面那几组——打开设置十次有九次只是想换个局，
   开关和分享不该每次都铺在眼前。展开状态记在 view 上，只活在这一次会话里，
   不写盘：刷新页面就回到收起的样子。
   ========================================================== */
export function setMoreOpen(open) {
  view.sheetMore = !!open;
  sheetMore.hidden = !view.sheetMore;
  btnMoreOpts.setAttribute('aria-expanded', view.sheetMore ? 'true' : 'false');
  moreOptsLabel.textContent = view.sheetMore ? '收起更多选项' : '显示更多选项';
  // 分享框刚从 hidden 里出来时高度是 0，露出来之后再量一次
  if (view.sheetMore) fitShareCode();
}

export function toggleMore() {
  setMoreOpen(!view.sheetMore);
  announce(view.sheetMore ? '已展开全部设置' : '已收起更多选项');
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
  setMoreOpen(view.sheetMore);   // 沿用这次会话里上次的展开状态
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

/* 从「没抽到够格的盘」那层跳过来时，面板要停在他刚才要的那一档上：
 * openSheet 是从「这局实际是什么」起算的，可这时压根没装上盘，
 * 照原样开出来会变成「不限」，看着像是他的选择没被记住。 */
export function openSheetAt(difficulty, size) {
  openSheet();
  if (difficulty && difficulty !== 'any' && DIFF_BANDS[difficulty]) pending.difficulty = difficulty;
  if (size) pending.size = size;
  syncSheet();
}

export function setPendingSize(n) {
  var rng = rangeOf(pending.difficulty);
  n = clamp(n, rng[0], rng[1]);   // 只能落在这一档开放过的尺寸里
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
