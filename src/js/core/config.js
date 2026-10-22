/* ============================================================================
 * config.js
 * 全局常量：棋盘尺寸范围、本地存储键、难度档位、默认设置、皇后 SVG。
 * ========================================================================== */

export var SIZE_MIN = 4;
export var SIZE_MAX = 16;
export var STORE_SETTINGS = 'queens.settings.v1';
export var STORE_GAME = 'queens.game.v1';

/* 目标难度：每个档位实测下来只对应一段棋盘尺寸（见难度调研报告），
 * 所以「选难度」实际就是「选尺寸区间」，不需要反复重试。 */
export var DIFF_BANDS = {
  easy: { name: '容易', lo: 4, hi: 5 },
  mid: { name: '中等', lo: 6, hi: 8 },
  hard: { name: '困难', lo: 9, hi: 12 },
  extreme: { name: '极难', lo: 13, hi: 16 }
};
export var DIFF_ORDER = ['any', 'easy', 'mid', 'hard', 'extreme'];

export var DEFAULT_SETTINGS = {
  size: 8,
  difficulty: 'any',
  autoMark: true,
  conflict: true,
  forced: true,
  sound: true,
  haptics: true
};

export var REDUCE_MOTION = window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export var QUEEN_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M12 3.3l2.2 4 3.6-2.3-1 5.5H7.2l-1-5.5 3.6 2.3 2.2-4z" fill="currentColor"/>' +
  '<path d="M7.4 11.5h9.2l1.55 6.6H5.85l1.55-6.6z" fill="currentColor"/>' +
  '<rect x="5" y="18.9" width="14" height="2.7" rx="1.35" fill="currentColor"/>' +
  '<circle cx="12" cy="3.3" r="1.45" fill="currentColor"/>' +
  '<circle cx="6.2" cy="5.5" r="1.35" fill="currentColor"/>' +
  '<circle cx="17.8" cy="5.5" r="1.35" fill="currentColor"/>' +
  '</svg>';
