/* ============================================================================
 * config.js
 * 全局常量：棋盘尺寸范围、本地存储键、难度档位、默认设置。
 * （外观的画法不在这里了：色块图案 / 叉 / 皇后都搬进 src/js/looks/ 的插件，
 *   这里只留下「默认选哪一套」这一件事。）
 * ========================================================================== */

import { DEFAULT_LOOK } from '../looks/index.js';

export var SIZE_MIN = 4;
export var SIZE_MAX = 16;
export var STORE_SETTINGS = 'queens.settings.v1';
export var STORE_GAME = 'queens.game.v1';
export var STORE_RECORDS = 'queens.records.v1';

/* 设置的存档版本：改了某个默认值、又想让老存档跟上新默认值时 +1。
 *   v2：淡化 × 改成默认关闭（一铺半盘的 × 全淡下去，反而看不出棋盘的进度）。
 * 老存档（没有 sv 字段）里这一项一律按新默认走，别的偏好照旧保留。 */
export var SETTINGS_VERSION = 2;

/* 战绩：最多留多少条（新的在前，超出丢最老的）、列表一次画多少条、
 * 排行榜每组最多显示几名。都只影响展示，不影响统计。 */
export var RECORD_MAX = 300;
export var RECORD_PAGE = 20;
export var RECORD_TOP = 12;

/* 目标难度：每个档位实测下来只对应一段棋盘尺寸（见难度调研报告），
 * 所以「选难度」实际就是「选尺寸区间」，不需要反复重试。 */
export var DIFF_BANDS = {
  easy: { name: '容易', lo: 4, hi: 5 },
  mid: { name: '中等', lo: 6, hi: 8 },
  hard: { name: '困难', lo: 9, hi: 12 },
  extreme: { name: '极难', lo: 13, hi: 16 }
};
export var DIFF_ORDER = ['any', 'easy', 'mid', 'hard', 'extreme'];

/* 挑战：限时挡位（毫秒，0 = 不限时）。
 * 设置面板的按钮按这张表生成，加挡位只改这里。 */
export var LIMIT_OPTIONS = [
  { ms: 0, label: '不限' },
  { ms: 180000, label: '3 分' },
  { ms: 300000, label: '5 分' },
  { ms: 600000, label: '10 分' },
  { ms: 1200000, label: '20 分' }
];

export var LIMIT_MAX = 3600000;

export function normalizeLimit(ms) {
  ms = parseInt(ms, 10);
  if (!ms || ms < 0) return 0;
  return Math.min(ms, LIMIT_MAX);
}

/** 限时的人话说法：「5 分钟」/「不限时」。 */
export function limitLabel(ms) {
  if (!ms) return '不限时';
  var m = Math.round(ms / 60000);
  return m >= 1 ? m + ' 分钟' : '不到 1 分钟';
}

export var DEFAULT_SETTINGS = {
  size: 8,
  difficulty: 'any',
  autoMark: true,
  conflict: true,
  forced: true,
  sound: true,
  haptics: true,
  /* 拖动标 × 的落点方式：开着按行列对齐（锁一行 / 一列，见 events.js），
   * 关掉就跟着手指走，想斜着涂也随便。 */
  alignDrag: true,
  // 挑战（即时生效，也跟着存盘）
  timeLimit: 0,     // 本局限时（毫秒），0 = 不限时
  noHint: false,    // 禁用提示
  noUndo: false,    // 禁用撤销
  // 外观（即时生效，跟着存盘）：色块的图案、叉的样式、皇后样式
  // 默认就是各自那一类里的第一套（见 looks/index.js 的 DEFAULT_LOOK）
  surfaceStyle: DEFAULT_LOOK.surface,
  markStyle: DEFAULT_LOOK.mark,
  pieceStyle: DEFAULT_LOOK.piece,
  /* 淡化（即时生效）：填过的格子退到后面去，别跟空格抢眼睛。
   * 默认都关着——淡下去以后「这格处理过了」的分量也跟着没了，
   * 想要安静的棋盘再自己开。 */
  fadeMark: false,
  fadeQueen: false
};

export var REDUCE_MOTION = window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
