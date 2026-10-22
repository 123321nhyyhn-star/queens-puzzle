/* ============================================================================
 * events.js
 * 事件接线层：所有 DOM 事件的绑定集中在这里，方便一眼看清「哪里点了会怎样」。
 * ========================================================================== */

import { canPlay, clearBoard, onCell, placeQueen } from './app/actions.js';
import { newGame, retryGame } from './app/puzzle.js';
import { audio, buzz, sfx } from './core/audio.js';
import { pauseTimer, startTimer } from './core/clock.js';
import { DIFF_BANDS, DIFF_ORDER, SIZE_MAX, SIZE_MIN } from './core/config.js';
import { btnAgain, btnClear, btnClearRecs, btnCloseDiff, btnCloseLook, btnCloseRec,
  btnCloseSheet, btnCopyCode, btnDiff, btnDiffDone, btnHint, btnLoadCode, btnLook, btnLookDone,
  btnMoreRecs, btnNew, btnPeek, btnRecords, btnSettings, btnShuffle, btnSize, btnUndo,
  coachClose, coachNext, coachPrev, diffBackdrop, diffOpts, diffSheet, gridEl, limChips,
  limitOpts, lookBackdrop, lookSheet, lvChips, quickRow, recBackdrop, recList, boardList,
  regionsEl, resultEl, shareCode, shareStatus, sheet, sheetBackdrop, sizeMinus, sizePlus,
  tabBoard, tabRecs } from './core/dom.js';
import { guide, hasProgress, pending, settings, state, view } from './core/state.js';
import { save, saveSettings } from './core/storage.js';
import { announce, clamp } from './core/utils.js';
import { endPeek } from './game/board.js';
import { decodeShare } from './game/share-code.js';
import { closeDiff, openDiff } from './ui/difficulty.js';
import { closeGuide, guideNext, guidePrev, useHint } from './ui/guide.js';
import { flashHint } from './ui/hint.js';
import { closeLook, openLook, pickLook } from './ui/look.js';
import { pushHistory, redo, undo } from './app/history.js';
import { render } from './ui/render.js';
import { closeSheet, commitChallenge, challengeSummary, openSheet, setPendingLimit,
  setPendingSize, syncSheet, trapFocus } from './ui/settings.js';
import { copyText, isShareFocusHold, setShareStatus, shareReject, tryLoadShare } from './ui/share.js';
import { dismissResult } from './ui/win.js';
import { closeRecords, openRecords, pickChip, recAction, requestClearAll, showMore,
  switchTab, trapRecords } from './ui/records.js';

// 松手 / 手势被打断 / 窗口失焦，都算结束（指针被捕获在老色卡上时也能兜住）
window.addEventListener('pointerup', endPeek, true);
window.addEventListener('pointercancel', endPeek, true);
window.addEventListener('blur', endPeek);
regionsEl.addEventListener('contextmenu', function (e) { e.preventDefault(); });

/* ==========================================================
   事件
   ========================================================== */
/* ---- 指针：轻点标 × / 双击放皇后 / 按住拖动批量涂抹 ---- */
var stroke = null;          // 当前这一笔：{ id, mode, x, y, moved, last }
var PAINT_SLOP = 6;         // 位移超过这么多像素才算「拖动」
var lastPaintTick = 0;

function cellAt(x, y, clampToBoard) {
  var n = state.size;
  if (!n) return -1;
  var rect = gridEl.getBoundingClientRect();
  if (!rect.width) return -1;
  var step = rect.width / n;
  var c = Math.floor((x - rect.left) / step);
  var r = Math.floor((y - rect.top) / step);
  if (clampToBoard) {
    // 拖出棋盘也继续往边缘涂，手感更连贯
    c = Math.max(0, Math.min(n - 1, c));
    r = Math.max(0, Math.min(n - 1, r));
  } else if (r < 0 || r >= n || c < 0 || c >= n) {
    return -1;
  }
  return r * n + c;
}

// 只改一格，不写历史、不存盘（整笔结束时统一处理）
function paintOne(i, mode) {
  if (i < 0) return false;
  if (mode === 'paint') {
    if (state.marks[i] !== 0) return false;
    if (state.auto && state.auto[i]) return false;
    state.marks[i] = 1;
    return true;
  }
  if (mode === 'erase') {
    if (state.marks[i] !== 1) return false;
    state.marks[i] = 0;
    return true;
  }
  return false;
}

// 两次 pointermove 之间可能跨过好几格，按直线补齐，快速划也不会断
function paintAlong(to, mode) {
  var n = state.size;
  var from = stroke.last;
  var r0 = (from / n) | 0, c0 = from % n;
  var r1 = (to / n) | 0, c1 = to % n;
  var steps = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0));
  var changed = false;
  for (var s = 1; s <= steps; s++) {
    var rr = Math.round(r0 + (r1 - r0) * s / steps);
    var cc = Math.round(c0 + (c1 - c0) * s / steps);
    if (paintOne(rr * n + cc, mode)) changed = true;
  }
  return changed;
}

function paintTick() {
  var t = performance.now();
  if (t - lastPaintTick < 40) return;
  lastPaintTick = t;
  sfx('x');
}

gridEl.addEventListener('pointerdown', function (e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  var cell = e.target.closest ? e.target.closest('.cell') : null;
  if (!cell) return;
  var i = parseInt(cell.dataset.i, 10);
  if (isNaN(i) || !canPlay()) return;

  var now = performance.now();
  var last = state.lastTap;
  var dbl = !!(last && last.i === i && (now - last.t) < 340);
  var prev = state.marks[i];
  var autoHere = !!(state.auto && state.auto[i]);

  onCell(i);  // 沿用原来的单击 / 双击语义（这一格立刻生效）

  // 落笔方向决定这一笔是「画」还是「擦」：落点原本是空的就画，原本是手标 × 就擦
  var mode = 'none';
  if (!dbl) {
    if (prev === 0 && !autoHere) mode = 'paint';
    else if (prev === 1) mode = 'erase';
  }
  stroke = {
    id: e.pointerId, mode: mode,
    x: e.clientX, y: e.clientY,
    moved: false, last: i,
    axis: '',                 // 首次超过阈值时定方向，之后整笔只走那一行 / 那一列
    startR: (i / state.size) | 0,
    startC: i % state.size
  };

  if (mode !== 'none') {
    e.preventDefault();
    if (gridEl.setPointerCapture) {
      try { gridEl.setPointerCapture(e.pointerId); } catch (err) { /* 老浏览器忽略 */ }
    }
  }
});

gridEl.addEventListener('pointermove', function (e) {
  if (!stroke || e.pointerId !== stroke.id || stroke.mode === 'none') return;
  // 拖到一半限时到了：这局已经封盘，别再往棋盘上涂
  if (!canPlay()) return;
  var dx = e.clientX - stroke.x;
  var dy = e.clientY - stroke.y;
  if (!stroke.axis) {
    var ax = Math.abs(dx), ay = Math.abs(dy);
    var big = Math.max(ax, ay);
    if (big < PAINT_SLOP) return;
    // 两个方向差不多时再等等，免得手指刚起手的一下抖动把方向判反
    if (big < PAINT_SLOP * 2 && big < Math.min(ax, ay) * 1.8) return;
    // 先明确的那个方向定死整笔走向：横向只涂这一行，纵向只涂这一列
    stroke.axis = ax >= ay ? 'x' : 'y';
    stroke.moved = true;
    state.lastTap = null;  // 开始拖动后就不再判双击，免得划回原格变放皇后
    gridEl.classList.add('is-painting');
  }
  e.preventDefault();
  var n = state.size;
  var i = cellAt(e.clientX, e.clientY, true);
  if (i < 0) return;
  var r = stroke.startR;
  var c = stroke.startC;
  if (stroke.axis === 'x') c = i % n;
  else r = (i / n) | 0;
  var target = r * n + c;
  if (target === stroke.last) return;
  var changed = paintAlong(target, stroke.mode);
  stroke.last = target;
  if (changed) {
    render();
    paintTick();
  }
});

function endStroke(e) {
  if (!stroke) return;
  if (e && e.pointerId != null && e.pointerId !== stroke.id) return;
  var moved = stroke.moved;
  var id = stroke.id;
  stroke = null;
  gridEl.classList.remove('is-painting');
  if (gridEl.hasPointerCapture && gridEl.hasPointerCapture(id)) {
    try { gridEl.releasePointerCapture(id); } catch (err) { /* 忽略 */ }
  }
  if (moved) save();  // 一整笔只存一次盘
}

gridEl.addEventListener('pointerup', endStroke);
gridEl.addEventListener('pointercancel', endStroke);
window.addEventListener('pointerup', endStroke);
window.addEventListener('pointercancel', endStroke);

// 长按时别弹系统菜单
gridEl.addEventListener('contextmenu', function (e) { e.preventDefault(); });

gridEl.addEventListener('click', function (e) {
  // 指针的点击已经在 pointerdown 里处理；这里只兜住键盘 / 读屏器合成的 click。
  // 不支持 Pointer Events 的老浏览器退化成「只能点、不能拖」。
  if (window.PointerEvent && e.detail !== 0) return;
  var cell = e.target.closest ? e.target.closest('.cell') : null;
  if (!cell) return;
  var i = parseInt(cell.dataset.i, 10);
  if (!isNaN(i)) onCell(i);
});

btnUndo.addEventListener('click', undo);
btnHint.addEventListener('click', useHint);
btnClear.addEventListener('click', function () { clearBoard(false); });

coachPrev.addEventListener('click', guidePrev);
coachNext.addEventListener('click', guideNext);
coachClose.addEventListener('click', function () {
  closeGuide();
  flashHint('需要的时候再点「提示」');
});

btnNew.addEventListener('click', function () {
  newGame(state.size);
});

btnSettings.addEventListener('click', openSheet);
btnSize.addEventListener('click', openSheet);
btnCloseSheet.addEventListener('click', closeSheet);
sheetBackdrop.addEventListener('click', closeSheet);

/* ---- 外观：叉 / 皇后的样式，选完立刻生效 ---- */
btnLook.addEventListener('click', openLook);
btnCloseLook.addEventListener('click', closeLook);
btnLookDone.addEventListener('click', closeLook);
lookBackdrop.addEventListener('click', closeLook);
lookSheet.addEventListener('click', function (e) {
  var b = e.target.closest ? e.target.closest('.showcase') : null;
  if (!b) return;
  if (b.dataset.mark) pickLook('mark', b.dataset.mark);
  else if (b.dataset.piece) pickLook('piece', b.dataset.piece);
});

btnDiff.addEventListener('click', openDiff);
btnCloseDiff.addEventListener('click', function () { closeDiff(true); });
btnDiffDone.addEventListener('click', function () { closeDiff(true); });
diffBackdrop.addEventListener('click', function () { closeDiff(true); });

/* ---- 战绩 / 排行榜 ---- */
btnRecords.addEventListener('click', openRecords);
btnCloseRec.addEventListener('click', closeRecords);
recBackdrop.addEventListener('click', closeRecords);
tabRecs.addEventListener('click', function () { switchTab('list'); });
tabBoard.addEventListener('click', function () { switchTab('board'); });
limChips.addEventListener('click', pickChip);
lvChips.addEventListener('click', pickChip);
recList.addEventListener('click', recAction);
boardList.addEventListener('click', recAction);
btnMoreRecs.addEventListener('click', showMore);
btnClearRecs.addEventListener('click', requestClearAll);
/* 换一局：唯一会作废当前这局的动作，面板上半部分（尺寸 / 难度 / 挑战）的改动都在这里落地 */
btnShuffle.addEventListener('click', function () {
  var lv = pending.difficulty && pending.difficulty !== 'any' ? pending.difficulty : 'any';
  var band = DIFF_BANDS[lv] || null;
  var challenge = challengeSummary();   // 落地前先记下来，好念给读屏

  settings.difficulty = lv;
  if (!band) settings.size = clamp(pending.size, SIZE_MIN, SIZE_MAX);
  commitChallenge();
  saveSettings();

  closeSheet();
  newGame(settings.size);

  if (band) announce('已换局，目标难度：' + band.name + (challenge ? '，挑战：' + challenge : ''));
  else announce('已换局：' + settings.size + '×' + settings.size +
    (challenge ? '，挑战：' + challenge : ''));
});

sizeMinus.addEventListener('click', function () {
  setPendingSize(pending.size - 1);
});

sizePlus.addEventListener('click', function () {
  setPendingSize(pending.size + 1);
});

quickRow.addEventListener('click', function (e) {
  var btn = e.target.closest ? e.target.closest('.qbtn') : null;
  if (!btn) return;
  setPendingSize(parseInt(btn.dataset.size, 10));
});

/* 目标难度：只记选择，不碰正在下的这局——点「换一局」才生效。 */
diffOpts.addEventListener('click', function (e) {
  var btn = e.target.closest ? e.target.closest('.dbtn') : null;
  if (!btn) return;
  var lv = btn.dataset.level;
  if (DIFF_ORDER.indexOf(lv) < 0 || lv === pending.difficulty) return;

  pending.difficulty = lv;
  syncSheet();
  announce(lv === 'any' ? '目标难度：不限' : '目标难度：' + DIFF_BANDS[lv].name + '（换一局后生效）');
});

/* 限时：跟尺寸 / 难度一样只记意向，点「换一局」才真的开始计时 */
limitOpts.addEventListener('click', function (e) {
  var btn = e.target.closest ? e.target.closest('.lbtn') : null;
  if (!btn) return;
  setPendingLimit(parseInt(btn.dataset.limit, 10));
  sfx('x');
  buzz(5);
});

/* ---- 分享棋盘 ---- */
btnCopyCode.addEventListener('click', function () {
  var val = (shareCode.value || '').trim();
  if (!val) { shareReject('现在还没有棋盘可以分享'); return; }
  copyText(val, function (ok) {
    if (ok) {
      setShareStatus('已复制，发给朋友就能玩这一局', 'good');
      sfx('share');
      buzz(10);
      announce('棋盘代码已复制');
    } else {
      setShareStatus('这个浏览器不让自动复制，长按上面的代码手动全选吧', 'bad');
      shareCode.focus();
      shareCode.select();
    }
  });
});

btnLoadCode.addEventListener('click', function () { tryLoadShare(shareCode.value); });

shareCode.addEventListener('paste', function (e) {
  var text = '';
  try {
    var cb = e.clipboardData || window.clipboardData;
    text = cb ? (cb.getData('text') || '') : '';
  } catch (err) { text = ''; }
  if (!text) return;

  var out = decodeShare(text);
  if (out.ok) {
    // 粘的是一整串棋盘代码，直接开这一局
    e.preventDefault();
    shareCode.value = text.trim();
    tryLoadShare(text);
    return;
  }
  window.setTimeout(function () { setShareStatus(out.msg, 'bad'); }, 0);
});

shareCode.addEventListener('keydown', function (e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    tryLoadShare(shareCode.value);
  }
});

// 手机上弹出键盘会盖住面板下半截，聚焦时把分享区顶到可视范围靠上
shareCode.addEventListener('focus', function () {
  if (isShareFocusHold()) return;
  window.setTimeout(function () {
    if (!view.sheetOpen || sheet.scrollHeight <= sheet.clientHeight + 4) return;
    var top = shareCode.parentNode.offsetTop - 12;
    if (sheet.scrollTop < top) sheet.scrollTop = top;
  }, 80);
});

shareCode.addEventListener('input', function () {
  if (shareStatus.classList.contains('is-bad')) setShareStatus('');
});

sheet.addEventListener('click', function (e) {
  var sw = e.target.closest ? e.target.closest('.switch') : null;
  if (!sw) return;
  var id = sw.id;
  if (id === 'swAuto') {
    settings.autoMark = !settings.autoMark;
    render();
  } else if (id === 'swConflict') {
    settings.conflict = !settings.conflict;
    if (!settings.conflict) view.lastConflictCount = 0;
    render();
  } else if (id === 'swForced') {
    settings.forced = !settings.forced;
    render();
  } else if (id === 'swSound') {
    settings.sound = !settings.sound;
    if (settings.sound) { audio.init(); sfx('x'); }
  } else if (id === 'swHaptics') {
    settings.haptics = !settings.haptics;
    if (settings.haptics) buzz(12);
  } else if (id === 'swNoHint') {
    // 挑战这一组只写 pending：这一局的规则不改，换一局才生效
    pending.noHint = !pending.noHint;
    announce(pending.noHint ? '挑战：换一局后禁用提示' : '挑战：换一局后恢复提示');
  } else if (id === 'swNoUndo') {
    pending.noUndo = !pending.noUndo;
    announce(pending.noUndo ? '挑战：换一局后禁用撤销' : '挑战：换一局后恢复撤销');
  }
  syncSheet();
  saveSettings();
});

btnAgain.addEventListener('click', function () {
  var lost = state.status === 'lost';
  dismissResult(true);
  if (lost) retryGame(); else newGame(state.size);
});
btnPeek.addEventListener('click', function () {
  var lost = state.status === 'lost';
  dismissResult(true);
  // 解开时是「看看棋盘」（结果层收掉就行）；输了就只有「换一局新的」这条路
  if (lost) newGame(state.size);
});
resultEl.addEventListener('click', function (e) {
  if (e.target === resultEl) dismissResult();
});

document.addEventListener('pointerdown', function () { audio.init(); }, { capture: true, once: true });
document.addEventListener('keydown', function () { audio.init(); }, { capture: true, once: true });

document.addEventListener('visibilitychange', function () {
  if (document.hidden) {
    pauseTimer();
    save();
  } else {
    if (state.status === 'playing' && hasProgress()) startTimer();
    if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
  }
});

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    if (view.diffOpen) { e.preventDefault(); closeDiff(true); return; }
    if (view.recordsOpen) { e.preventDefault(); closeRecords(); return; }
    if (view.lookOpen) { e.preventDefault(); closeLook(); return; }
    if (view.sheetOpen) { e.preventDefault(); closeSheet(); return; }
    if (view.resultOpen) { e.preventDefault(); dismissResult(); return; }
    if (guide.open) { e.preventDefault(); closeGuide(); return; }
    state.lastTap = null;
  }

  if (view.diffOpen) {
    if (e.key === 'Tab') trapFocus(e, diffSheet);
    return;
  }

  if (view.recordsOpen) {
    if (e.key === 'Tab') trapRecords(e);
    return;
  }

  if (view.lookOpen) {
    if (e.key === 'Tab') trapFocus(e, lookSheet);
    return;
  }

  if (view.sheetOpen) {
    if (e.key === 'Tab') trapFocus(e, sheet);
    return;
  }

  if (view.resultOpen) {
    if (e.key === 'Tab') trapFocus(e, resultEl);
    if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      var lostNow = state.status === 'lost';
      dismissResult(true);
      if (lostNow) retryGame(); else newGame(state.size);
    }
    return;
  }

  if (e.ctrlKey || e.metaKey) {
    if (e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
    }
    return;
  }

  var key = e.key;
  var active = document.activeElement;
  var focused = active && active.classList && active.classList.contains('cell')
    ? parseInt(active.dataset.i, 10) : -1;

  if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
    e.preventDefault();
    var n = state.size;
    var i = focused >= 0 ? focused : state.focus;
    var r = (i / n) | 0, c = i % n;
    if (key === 'ArrowUp') r = (r - 1 + n) % n;
    if (key === 'ArrowDown') r = (r + 1) % n;
    if (key === 'ArrowLeft') c = (c - 1 + n) % n;
    if (key === 'ArrowRight') c = (c + 1) % n;
    state.focus = r * n + c;
    for (var k = 0; k < view.cells.length; k++) view.cells[k].tabIndex = -1;
    view.cells[state.focus].tabIndex = 0;
    view.cells[state.focus].focus();
    return;
  }

  if (key === 'x' || key === 'X') {
    if (focused >= 0) { e.preventDefault(); onCell(focused); }
    return;
  }

  if (key === 'q' || key === 'Q') {
    if (focused >= 0) {
      e.preventDefault();
      placeQueen(focused);
    }
    return;
  }

  if (key === 'Enter' || key === ' ') {
    if (focused >= 0) {
      e.preventDefault();
      placeQueen(focused);
    }
    return;
  }

  if (key === 'Backspace' || key === 'Delete') {
    if (focused >= 0) {
      e.preventDefault();
      if (!canPlay()) return;
      pushHistory();
      state.marks[focused] = 0;
      state.lastTap = null;
      render();
      save();
    }
    return;
  }

  if (key === 'z' || key === 'Z') {
    e.preventDefault();
    if (e.shiftKey) redo(); else undo();
    return;
  }

  if (key === 'h' || key === 'H') {
    e.preventDefault();
    useHint();
    return;
  }

  if (key === 'n' || key === 'N') {
    e.preventDefault();
    newGame(state.size);
  }
});
