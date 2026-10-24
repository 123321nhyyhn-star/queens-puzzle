/* ============================================================================
 * puzzle.js
 * 出题与换盘：按目标难度夹尺寸、挑出落进档位区间的一张、生成遮罩、把棋盘装上。
 * ========================================================================== */

import { sfx } from '../core/audio.js';
import { DIFF_BANDS, limitLabel, SIZE_MAX, SIZE_MIN } from '../core/config.js';
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
import { closeSheet, isOpen } from '../core/sheet.js';
import { dismissMismatch, showMismatch } from '../ui/panels/mismatch.js';

/* ==========================================================
   新一局
   ----------------------------------------------------------
   尺寸由玩家在「目标难度」开放的区间里挑（见 DIFF_BANDS），这里只负责夹一次；
   然后 pickBoard 抽最多 4 张，取第一张分数落进 [min, max) 的。一张都没落进去
   就不装盘，反过来问玩家「再抽一局 / 更换设置」——见下面的 roll()。
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

/* ------------------------------------------------------------ 挑盘
 * 生成最多 tries 张，第一张落进 [min, max) 的就装；一张都没落进去就收手。
 * 引擎本来每局就要抽 2~3 张（挑色块最均匀的那张），所以平均成本基本不变；
 * 度量本身是 1ms 级，瓶颈始终在生成。
 *
 * 为什么不在引擎里挑：engine.js 是独立 UMD，引用 difficulty.js 会破坏分层、
 * 也拖慢引擎。这里是 app 层，两边都看得见，正合适。
 *
 * band 为 null（不限难度）时只生成一张就走。
 *
 * 两头都不够格不是「失败」——这时**不装盘**，交给 mismatch 层问玩家要不要
 * 再抽一批（见 ui/panels/mismatch.js）；装上去了，目标难度就名存实亡。
 * 上界同样要卡：只卡下限的话，选「困难」会掉出一盘 8.6 的极难盘。
 * 没装的那批里挑出「差得最少」的一张报给那一层 —— 偏低报最高、偏高报最低。
 */
var PICK_TRIES = 4;

/* 玩家点了「再抽一局」就把这一批抽得更狠一点：4 → 5 → 6 封顶。
 * 单张落在档内的概率只有二到五成（9×9 的困难盘只有约两成），一路 4 张
 * 抽下去仍会「点半天不给盘」；而多抽的这点成本只在真卡住时才付，
 * 16×16 抽满 6 张也在 1 秒内（有遮罩兜着）。 */
function triesFor(tried) {
  return PICK_TRIES + Math.min(Math.floor(tried / PICK_TRIES), 2);
}

function pickBoard(n, band, tries) {
  var best = null, bestV = null, made = 0;
  var under = null, over = null;   // 没落进区间：偏低里最高的 / 偏高里最低的
  for (var i = 0; i < tries; i++) {
    var b = null;
    try { b = window.QueensEngine.generate(n); } catch (e) { b = null; }
    if (!b) continue;
    made++;
    var v = computeVibe(b.size, b.regions, b.solution);
    if (!v) return { board: b, vibe: null, tries: made, off: null };
    if (!band) return { board: b, vibe: v, tries: made, off: null };
    if (v.score >= band.max) { if (!over || v.score < over.score) over = v; continue; }
    if (v.score < band.min) { if (!under || v.score > under.score) under = v; continue; }
    best = b; bestV = v;
    break;                                   // 落进区间就收
  }

  /* 一张都没进区间：报「离区间最近」的那一头（正好两边都有就取更近的），
   * 那一层据此说「最高 6.8，还差点」还是「最低 8.6，超了」。 */
  var off = null;
  if (!bestV) {
    if (under && over) {
      off = band.min - under.score <= over.score - band.max
        ? { vibe: under, dir: 'low' } : { vibe: over, dir: 'high' };
    } else if (under) off = { vibe: under, dir: 'low' };
    else if (over) off = { vibe: over, dir: 'high' };
  }
  return { board: best, vibe: bestV, tries: made, off: off };
}

export function newGame(size) {
  var band = targetBand();
  var n = clamp(size || state.size, SIZE_MIN, SIZE_MAX);
  // 选了档位就只在这个档开放过的尺寸里出题（4×4 不可能难，16×16 也不会容易）
  if (band) n = clamp(n, band.lo, band.hi);
  roll(n, band, 0);
}

/* 出一盘：抽一批，落进档位区间就装，没落进去就摆出两条路让玩家选。
 * tried 是「这次换局一共已经抽掉多少张」——再抽时累加上去，
 * 好让那一层照实说「13×13 抽了 6 张，最高 7.8」。 */
function roll(n, band, tried) {
  if (isOpen('result')) closeSheet('result', { force: true });
  dismissMismatch();
  boardEl.classList.remove('is-won', 'is-lost');

  // 已知这一档会卡就立刻露遮罩，否则先等 90ms——算得快就当没这回事
  var heavy = !!band || n >= 13;
  if (heavy) showVeil(n, band ? '正在生成「' + band.name + '」' + n + '×' + n : null, veilDelayFor(n));

  var run = function () {
    var t0 = performance.now();
    var picked = pickBoard(n, band, triesFor(tried));
    var board = picked.board;
    var vibe = picked.vibe;
    if (!board) {
      hideVeil();
      // 有 band 时一张都没落进区间，picked.off 一定在；没有就是真生成失败
      if (!picked.off) { flashHint('生成失败，请再试一次'); return; }

      // 记下这局真正占住主线程多久，下次同尺寸就知道要不要提前露遮罩
      blockCost[n] = Math.max(blockCost[n] || 0, Math.round(performance.now() - t0));

      /* 这批一张都没落进档位区间：这一盘不装。
       * 尺寸和档位都在 allowed 范围内，只是这批手气不好——玩家说了算：
       * 再抽一批，还是换个尺寸/档位。dir 说明是「不够」还是「超了」，
       * 那一层的标题、读数、建议都跟着这个走。 */
      showMismatch({
        size: n,
        band: band,
        difficulty: settings.difficulty,
        dir: picked.off.dir,
        vibe: picked.off.vibe,
        tried: tried + picked.tries,
        onRetry: function () { roll(n, band, tried + picked.tries); }
      });
      return;
    }

    // 记下这局真正占住主线程多久，下次同尺寸就知道要不要提前露遮罩
    var cost = Math.round(performance.now() - t0);
    blockCost[board.size] = Math.max(blockCost[board.size] || 0, cost);

    applyBoard(board.size, board.regions, board.solution, board.seed, vibe);

    if (n >= 13 && cost > 320) {
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

/* 把一副已经确定的棋盘装上（新生成 / 载入分享码 / 恢复存档 / 重试共用） */
export function applyBoard(n, regions, solution, seed, preVibe) {
  if (isOpen('result')) closeSheet('result', { force: true });
  dismissMismatch();   // 真装上了，那张「不够格」的卡就不该还挂着
  if (guide.open) closeGuide();
  paintGl(null);
  resetBad();          // 上局的红框 / 待提醒计时一起作废
  boardEl.classList.remove('is-won', 'is-lost');

  state.size = n;
  state.seed = seed || 0;
  state.regions = regions;
  state.solution = solution;
  state.vibe = preVibe || computeVibe(n, regions, solution);
  state.marks = new Uint8Array(n * n);
  state.hints = 0;
  state.moves = 0;
  state.steps = 0;
  state.elapsed = 0;
  state.runningSince = 0;
  state.status = 'playing';
  state.lostBy = null;
  state.focus = 0;
  state.lastTap = null;
  state.conflicts = { pairs: [], cells: new Set(), count: 0 };
  state.forced = null;
  // 记下这盘实际用到的难度档，用来判断设置面板里选的东西「是否还没生效」
  state.diffApplied = settings.difficulty;
  /* 挑战：限时从这一局的第一笔操作起算（新局 / 重试都把起算点归零）；
   * 步数限制看的是这一局走了几步，也一并从设置里取。 */
  state.limit = settings.timeLimit || 0;
  state.limitFrom = 0;
  state.stepLimit = settings.stepLimit || 0;
  view.lastConflictCount = 0;
  view.undo = [];
  view.redo = [];
  /* 上一局可能还有一串「补齐」在落子：换盘时把锁解开，
   * 那一串自己会发现 state.marks 已经不是它记的那个数组，随即收手。 */
  view.filling = false;
  view.lastFinish = null;   // 上一局的成绩别飘到这一局的结果卡上

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

/* 重试这一局：同一盘棋原样重开（不重新出题），用时、标记、撤销栈一起归零。
 * 限时的那局重试后重新计时——挑战里输了不该被按住不动。 */
export function retryGame() {
  if (!state.regions) { newGame(state.size); return; }
  applyBoard(state.size, state.regions, state.solution, state.seed, state.vibe);
  var msg = state.limit ? '重新开始，限时 ' + limitLabel(state.limit) : '重新开始这一局';
  flashHint(msg, true, 2000);
  announce(msg);
}
