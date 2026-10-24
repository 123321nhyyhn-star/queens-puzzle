/* ============================================================================
 * storage.js
 * 持久化：设置与当前这局的存档（localStorage，失败一律静默）。
 * ========================================================================== */

import { elapsedMs } from './clock.js';
import { DEFAULT_SETTINGS, DIFF_ORDER, normalizeLives, normalizeLimit, normalizeSteps,
  SETTINGS_VERSION, SIZE_MAX, SIZE_MIN, STORE_GAME, STORE_SETTINGS } from './config.js';
import { styleId } from '../looks/index.js';
import { settings, state } from './state.js';
import { clamp } from './utils.js';

/* ==========================================================
   设置读写
   ========================================================== */
/* 存盘时带上版本号：读的时候靠它判断「这个默认值是不是改过了」。
 * sv 只出现在盘上，不塞进 settings 本体，免得有人把它当成一个偏好。 */
function settingsJSON() {
  return JSON.stringify(Object.assign({ sv: SETTINGS_VERSION }, settings));
}

export function loadSettings() {
  try {
    var raw = window.localStorage.getItem(STORE_SETTINGS);
    if (!raw) return;
    var s = JSON.parse(raw);
    if (!s || typeof s !== 'object') return;
    var ver = parseInt(s.sv, 10) || 1;
    settings.size = clamp(parseInt(s.size, 10) || 8, SIZE_MIN, SIZE_MAX);
    settings.difficulty = DIFF_ORDER.indexOf(s.difficulty) >= 0 ? s.difficulty : 'any';
    settings.autoMark = s.autoMark !== false;
    settings.alignDrag = s.alignDrag !== false;
    settings.conflict = s.conflict !== false;
    settings.forced = s.forced !== false;
    settings.sound = s.sound !== false;
    settings.haptics = s.haptics !== false;
    settings.timeLimit = normalizeLimit(s.timeLimit);
    settings.stepLimit = normalizeSteps(s.stepLimit);
    settings.lifeLimit = normalizeLives(s.lifeLimit);
    settings.noHint = s.noHint === true;
    settings.noUndo = s.noUndo === true;
    // 外观：老存档没这几个字段、认不出来的 id（插件被删了）也退回默认，不至于把棋盘画空
    settings.surfaceStyle = styleId('surface', s.surfaceStyle);
    settings.markStyle = styleId('mark', s.markStyle);
    settings.pieceStyle = styleId('piece', s.pieceStyle);
    settings.lifeStyle = styleId('life', s.lifeStyle);
    /* 淡化：v2 起「淡化 ×」默认关闭。老存档没法区分「用户自己开过」和
     * 「旧默认开着」，所以干脆统一按新默认来——想淡回去面板里一拨就有。 */
    settings.fadeMark = ver >= SETTINGS_VERSION ? s.fadeMark === true : DEFAULT_SETTINGS.fadeMark;
    settings.fadeQueen = s.fadeQueen === true;
  } catch (e) { /* file:// 或隐私模式忽略 */ }
}

export function saveSettings() {
  try {
    window.localStorage.setItem(STORE_SETTINGS, settingsJSON());
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
    window.localStorage.setItem(STORE_SETTINGS, settingsJSON());
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
      /* 步数跟着存：刷新页面还得是那个数（它记的是这一局走过的路，
       * 不是撤销栈——栈根本没落盘）。 */
      steps: state.steps,
      stepLimit: state.stepLimit,
      /* 命数也跟着存：关掉页面再回来，剩几条命还是那几条。
       * 命用尽的那局存档里是 0，恢复后会被 main.js 的 checkLives() 再判一次负。 */
      lives: state.lives,
      lifeLimit: state.lifeLimit,
      lostBy: state.lostBy || '',
      elapsed: Math.round(elapsedMs()),
      status: state.status,
      // 限时也跟着存：关掉页面再回来，倒计时接着走，不会白捡时间
      limit: state.limit,
      limitFrom: Math.round(state.limitFrom || 0)
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
    /* 步数：老存档没这个字段，先按 0 起——那时没记过，编一个数比 0 更糟。
     * 步数限制同理：存档里有就用存档的（这一局的规则），没有就按当前设置。 */
    state.steps = clamp(parseInt(g.steps, 10) || 0, 0, 999999);
    state.stepLimit = normalizeSteps(g.stepLimit != null ? g.stepLimit : settings.stepLimit);
    /* 命数：老存档没有这两个字段，就按当前设置补满（那时还没有标错惩罚，
     * 补一个满格等于「这局没扣过血」）。正常存档里两样都有。 */
    state.lifeLimit = normalizeLives(g.lifeLimit != null ? g.lifeLimit : settings.lifeLimit);
    /* 缺 lives 字段（只可能是升级途中的存档）就按满格算：编一个 0 出来
     * 等于一读盘就判负。 */
    state.lives = state.lifeLimit
      ? (g.lives == null ? state.lifeLimit : clamp(parseInt(g.lives, 10) || 0, 0, state.lifeLimit))
      : 0;
    state.lostBy = null;   // 超时 / 步数 / 命用尽的那局恢复成 playing，心跳会再判一次负
    state.elapsed = Math.max(0, parseInt(g.elapsed, 10) || 0);
    state.status = g.status === 'won' ? 'won' : 'playing';
    state.runningSince = 0;
    /* 限时：老存档没这两个字段，就按当前设置补上。
     * 超时的那局照样恢复成 playing，下一帧 checkTimeout 会再判一次负——
     * 刷新页面不能把已经输掉的局救回来。 */
    state.limit = normalizeLimit(g.limit != null ? g.limit : settings.timeLimit);
    state.limitFrom = clamp(parseInt(g.limitFrom, 10) || 0, 0, state.elapsed);
    settings.size = n;
    return true;
  } catch (e) {
    return false;
  }
}
