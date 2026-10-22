/* ============================================================================
 * puzzle.js
 * 出题与换盘：按目标难度选尺寸、调引擎生成、生成遮罩、把棋盘装上。
 * ========================================================================== */

import { sfx } from '../core/audio.js';
import { DIFF_BANDS, SIZE_MAX, SIZE_MIN } from '../core/config.js';
import { boardEl, veil, veilTitle } from '../core/dom.js';
import { guide, settings, state, view } from '../core/state.js';
import { save, saveSettings } from '../core/storage.js';
import { announce, clamp } from '../core/utils.js';
import { buildBoard, buildRegionBar } from '../game/board.js';
import { computeVibe } from '../game/vibe.js';
import { updateDiffChip } from '../ui/difficulty.js';
import { closeGuide, paintGl } from '../ui/guide.js';
import { flashHint } from '../ui/hint.js';
import { relayout } from '../ui/layout.js';
import { render, resetBad, updateStats } from '../ui/render.js';
import { dismissResult } from '../ui/win.js';

/* ==========================================================
   新一局
   ----------------------------------------------------------
   设了目标难度就按难度选尺寸（见 DIFF_BANDS）；没设就照旧用用户选的尺寸。
   出题是同步的：算的时候主线程被占住，动画也会冻住，所以遮罩只是「告知」，
   不是「装饰」。快的时候根本不该出现——见 showVeil 的 delay。
   ========================================================== */
var veilTimer = 0;

/* 每个尺寸上一局实际阻塞了多久（生成 + 难度分析）。
 * 没测过就按 n^2.4 估：8×8≈2.5ms、16×16≈13ms —— 宁可估小，
 * 估小了最多是「该露遮罩时没露」，估大了会在快机器上每次都闪一下。 */
var blockCost = {};
function estBlock(n) {
  if (blockCost[n]) return blockCost[n];
  return Math.pow(Math.max(n, 4) / 8, 2.4) * 2.5;
}
export function veilDelayFor(n) {
  return estBlock(n) >= 90 ? 0 : 90;
}

/* delay>0：先等一会儿再露脸，算得快就当没这回事（避免闪一下）。
 * delay=0 ：立刻露脸，用于确定会卡住的场合，此时关掉淡入动画——
 *           淡入是靠主线程跑的，一阻塞就会停在半透明那一帧。 */
export function showVeil(n, label, delay) {
  veilTitle.textContent = label || ('正在生成 ' + n + '×' + n + ' 谜题');
  window.clearTimeout(veilTimer);
  veil.classList.toggle('is-instant', !delay);
  if (delay > 0) {
    veil.hidden = true;
    veilTimer = window.setTimeout(function () { veil.hidden = false; }, delay);
  } else {
    veil.hidden = false;
  }
}

export function hideVeil() {
  window.clearTimeout(veilTimer);
  veil.hidden = true;
}

function targetBand() {
  var t = settings.difficulty;
  return t && t !== 'any' && DIFF_BANDS[t] ? DIFF_BANDS[t] : null;
}

/* 在难度区间里随机取一个尺寸，尽量避开当前这盘，换局才有变化 */
function pickBandSize(band, avoid) {
  var span = band.hi - band.lo + 1;
  var n = band.lo + Math.floor(Math.random() * span);
  if (span > 1 && n === avoid) n = band.lo + ((n - band.lo + 1) % span);
  return n;
}

export function newGame(size, seed) {
  var band = targetBand();
  var n = band
    ? pickBandSize(band, state.size)
    : clamp(size || state.size, SIZE_MIN, SIZE_MAX);

  if (view.resultOpen) dismissResult();
  boardEl.classList.remove('is-won');

  // 已知这一档会卡就立刻露遮罩，否则先等 90ms——算得快就当没这回事
  var heavy = !!band || n >= 13;
  if (heavy) showVeil(n, band ? '正在生成「' + band.name + '」' + n + '×' + n : null, veilDelayFor(n));

  var run = function () {
    var t0 = performance.now();
    var board = null;
    var vibe = null;
    try {
      board = window.QueensEngine && window.QueensEngine.generate(n, seed);
    } catch (e) {
      board = null;
    }
    if (!board) {
      hideVeil();
      flashHint('生成失败，请再试一次');
      return;
    }

    // 目标难度：万一这一盘没落进档位（尺寸映射被改动时才会发生），换个尺寸再来一次
    if (band) {
      vibe = computeVibe(board.size, board.regions, board.solution);
      for (var retry = 0; retry < 2 && vibe && vibe.level !== band.name; retry++) {
        var n2 = pickBandSize(band, board.size);
        var b2 = null;
        try { b2 = window.QueensEngine.generate(n2); } catch (e2) { b2 = null; }
        if (!b2) break;
        var v2 = computeVibe(b2.size, b2.regions, b2.solution);
        if (!v2) break;
        board = b2;
        vibe = v2;
        if (v2.level === band.name) break;
      }
    }

    // 记下这局真正占住主线程多久，下次同尺寸就知道要不要提前露遮罩
    var cost = Math.round(performance.now() - t0);
    blockCost[board.size] = Math.max(blockCost[board.size] || 0, cost);

    applyBoard(board.size, board.regions, board.solution, board.seed, vibe);

    if (band && vibe && vibe.level !== band.name) {
      flashHint('这一盘最接近「' + band.name + '」：' + vibe.level + ' ' + vibe.score.toFixed(1), true, 1800);
    } else if (n >= 13 && cost > 320) {
      flashHint('这局生成用了 ' + (cost / 1000).toFixed(1) + ' 秒', true, 1400);
    }
    sfx('new');
    announce('新一局：' + board.size + '×' + board.size +
      (band ? '，目标难度' + band.name : '') + '，每行每列每个色块各一只皇后');
  };

  if (heavy) {
    window.requestAnimationFrame(function () {
      window.setTimeout(run, 30);
    });
  } else {
    run();
  }
}

/* 把一副已经确定的棋盘装上（新生成 / 载入分享码 / 恢复存档共用） */
export function applyBoard(n, regions, solution, seed, preVibe) {
  if (view.resultOpen) dismissResult();
  if (guide.open) closeGuide();
  paintGl(null);
  resetBad();          // 上局的红框 / 待提醒计时一起作废
  boardEl.classList.remove('is-won');

  state.size = n;
  state.seed = seed || 0;
  state.regions = regions;
  state.solution = solution;
  state.vibe = preVibe || computeVibe(n, regions, solution);
  state.marks = new Uint8Array(n * n);
  state.hints = 0;
  state.moves = 0;
  state.elapsed = 0;
  state.runningSince = 0;
  state.status = 'playing';
  state.focus = 0;
  state.lastTap = null;
  state.conflicts = { pairs: [], cells: new Set(), count: 0 };
  state.forced = null;
  // 记下这盘实际用到的难度档，用来判断设置面板里选的东西「是否还没生效」
  state.diffApplied = settings.difficulty;
  view.lastConflictCount = 0;
  view.undo = [];
  view.redo = [];

  settings.size = n;
  saveSettings();

  buildBoard(true);
  buildRegionBar();
  relayout();
  render();
  hideVeil();
  updateStats();
  updateDiffChip();
  save();
}
