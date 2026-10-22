/* ============================================================================
 * storage.js
 * 持久化：设置与当前这局的存档（localStorage，失败一律静默）。
 * ========================================================================== */

import { elapsedMs } from './clock.js';
import { DIFF_ORDER, SIZE_MAX, SIZE_MIN, STORE_GAME, STORE_SETTINGS } from './config.js';
import { settings, state } from './state.js';
import { clamp } from './utils.js';

/* ==========================================================
   设置读写
   ========================================================== */
export function loadSettings() {
  try {
    var raw = window.localStorage.getItem(STORE_SETTINGS);
    if (!raw) return;
    var s = JSON.parse(raw);
    if (!s || typeof s !== 'object') return;
    settings.size = clamp(parseInt(s.size, 10) || 8, SIZE_MIN, SIZE_MAX);
    settings.difficulty = DIFF_ORDER.indexOf(s.difficulty) >= 0 ? s.difficulty : 'any';
    settings.autoMark = s.autoMark !== false;
    settings.conflict = s.conflict !== false;
    settings.forced = s.forced !== false;
    settings.sound = s.sound !== false;
    settings.haptics = s.haptics !== false;
  } catch (e) { /* file:// 或隐私模式忽略 */ }
}

export function saveSettings() {
  try {
    window.localStorage.setItem(STORE_SETTINGS, JSON.stringify(settings));
  } catch (e) { /* 忽略 */ }
}

/* ==========================================================
   持久化
   ========================================================== */
/* 存档写盘做了 160ms 防抖：拖动连涂时不要每格都写一次 localStorage。 */
var saveTimer = null;

export function save() {
  if (saveTimer) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(doSave, 160);
}

export function doSave() {
  saveTimer = null;
  try {
    window.localStorage.setItem(STORE_SETTINGS, JSON.stringify(settings));
    if (!state.regions) return;
    var g = {
      v: 1,
      size: state.size,
      seed: state.seed,
      regions: Array.prototype.slice.call(state.regions),
      solution: Array.prototype.slice.call(state.solution),
      marks: Array.prototype.slice.call(state.marks),
      hints: state.hints,
      moves: state.moves,
      elapsed: Math.round(elapsedMs()),
      status: state.status
    };
    window.localStorage.setItem(STORE_GAME, JSON.stringify(g));
  } catch (e) { /* 忽略 */ }
}

export function loadGame() {
  try {
    var raw = window.localStorage.getItem(STORE_GAME);
    if (!raw) return false;
    var g = JSON.parse(raw);
    if (!g || !g.size) return false;
    var n = g.size;
    if (n < SIZE_MIN || n > SIZE_MAX) return false;
    if (!Array.isArray(g.regions) || g.regions.length !== n * n) return false;
    if (!Array.isArray(g.solution) || g.solution.length !== n) return false;
    if (!Array.isArray(g.marks) || g.marks.length !== n * n) return false;

    var regions = Uint8Array.from(g.regions);
    var solution = Int8Array.from(g.solution);
    var marks = Uint8Array.from(g.marks);

    // 轻量完整性检查
    var seen = new Array(n).fill(0);
    for (var i = 0; i < n * n; i++) {
      if (regions[i] < 0 || regions[i] >= n) return false;
      seen[regions[i]]++;
    }
    for (var k = 0; k < n; k++) if (!seen[k]) return false;
    for (var r = 0; r < n; r++) {
      if (solution[r] < 0 || solution[r] >= n) return false;
      if (regions[r * n + solution[r]] < 0) return false;
    }

    state.size = n;
    state.seed = g.seed || 0;
    state.regions = regions;
    state.solution = solution;
    state.vibe = null;   // 难度分由入口（main.boot）补算，存档层不依赖难度模型
    state.marks = marks;
    state.hints = clamp(parseInt(g.hints, 10) || 0, 0, 999);
    state.moves = clamp(parseInt(g.moves, 10) || 0, 0, 99999);
    state.elapsed = Math.max(0, parseInt(g.elapsed, 10) || 0);
    state.status = g.status === 'won' ? 'won' : 'playing';
    state.runningSince = 0;
    settings.size = n;
    return true;
  } catch (e) {
    return false;
  }
}
