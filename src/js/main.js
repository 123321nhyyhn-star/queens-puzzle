/* ============================================================================
 * main.js
 * 应用入口：启动流程（恢复存档 / 载入分享码 / 开新局）、尺寸监听、调试探针。
 * ========================================================================== */

import './events.js';   // 事件接线（纯副作用模块，必须早于 boot 执行）
import { clearBoard } from './app/actions.js';
import { applyBoard, newGame } from './app/puzzle.js';
import { elapsedMs, pauseTimer, startTimer } from './core/clock.js';
import { hintEl, stage, timeText } from './core/dom.js';
import { guide, hasProgress, settings, state } from './core/state.js';
import { doSave, loadGame, loadSettings } from './core/storage.js';
import { announce, formatTime } from './core/utils.js';
import { buildBoard, buildRegionBar } from './game/board.js';
import { decodeShare, encodeShare } from './game/share-code.js';
import { computeVibe } from './game/vibe.js';
import { closeDiff, openDiff, updateDiffChip } from './ui/difficulty.js';
import { closeGuide, guideNext, guidePrev, useHint } from './ui/guide.js';
import { flashHint } from './ui/hint.js';
import { relayout } from './ui/layout.js';
import { render, updateStats } from './ui/render.js';
import { syncAutoBtn } from './ui/settings.js';
import { takeHashCode, tryLoadShare } from './ui/share.js';
import { showResult } from './ui/win.js';

var ro = null;
var ticker = null;
if (window.ResizeObserver) {
  ro = new ResizeObserver(function () { relayout(); });
  ro.observe(stage);
} else {
  window.addEventListener('resize', relayout);
}

window.addEventListener('orientationchange', function () {
  window.setTimeout(relayout, 140);
});

/* ==========================================================
   启动
   ========================================================== */
function boot() {
  if (!window.QueensEngine) {
    hintEl.textContent = '引擎加载失败，请确认 src/js/engine/engine.js 能正常加载';
    hintEl.classList.add('is-alert');
    return;
  }

  loadSettings();
  syncAutoBtn();

  // 链接里带了棋盘代码（#QNS1-...）就直接开那一盘，否则照常续玩
  var handed = takeHashCode();
  var restored = !handed && loadGame();

  if (handed) {
    applyBoard(handed.size, handed.regions, handed.solution, 0);
    flashHint('已载入分享的 ' + handed.size + '×' + handed.size + ' 棋盘', true, 2400);
    announce('已载入分享的棋盘：' + handed.size + '×' + handed.size);
  } else if (restored) {
    state.diffApplied = settings.difficulty;   // 续玩的这局当作已按当前设置开出
    state.vibe = computeVibe(state.size, state.regions, state.solution);
    buildBoard(false);
    buildRegionBar();
    relayout();
    render();
    updateStats();
    updateDiffChip();

    if (state.status === 'won') {
      showResult();
    } else if (hasProgress()) {
      state.runningSince = 0;
      startTimer();
    }
    announce('已恢复上一局：' + state.size + '×' + state.size);
  } else {
    newGame(settings.size);
  }

  clearInterval(ticker);
  ticker = window.setInterval(function () {
    if (state.status === 'playing' && state.runningSince) {
      timeText.textContent = formatTime(elapsedMs());
    }
  }, 250);

  window.addEventListener('beforeunload', function () {
    pauseTimer();
    doSave();
  });
}

// 调试/自动化用（不影响正常游玩）
window.__QUEENS_DEBUG__ = {
  state: state,
  settings: settings,
  newGame: newGame,
  useHint: useHint,
  clear: function () { clearBoard(true); },
  render: render,
  vibe: function () { return state.vibe; },
  openDiff: openDiff,
  closeDiff: closeDiff,
  // 引导相关的探针，只给 tools/ 里的自动化测试用
  guide: function () {
    return { open: guide.open, at: guide.at, plan: guide.plan };
  },
  guideNext: guideNext,
  guidePrev: guidePrev,
  guideClose: closeGuide,
  encode: function () {
    return state.regions ? encodeShare(state.size, state.regions, state.solution) : '';
  },
  decode: decodeShare,
  loadCode: tryLoadShare
};

boot();
