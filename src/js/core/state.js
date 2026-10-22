/* ============================================================================
 * 皇后 Queens · 全局状态
 * ----------------------------------------------------------------------------
 * 拆模块后，原先那个大闭包里的可变状态集中放在这里。
 *
 * 约定：
 *   · state / settings / pending / guide / view 里的**字段**谁都可以改；
 *   · 但这几个对象本身**不许重新赋值**（ESM 的 import 绑定不可写）；
 *   · 万一以后真需要整个换掉，用 Object.assign(state, next) 而不是 state = next。
 * ========================================================================== */

import { DEFAULT_SETTINGS } from './config.js';

/** 当前这一局的局面。 */
export const state = {
  size: 8,
  seed: 0,
  regions: null,
  solution: null,
  marks: null,
  hints: 0,
  moves: 0,
  elapsed: 0,
  runningSince: 0,
  status: 'playing',
  auto: null,
  conflicts: null,
  regionCounts: null,
  focus: 0,
  lastTap: null,
  vibe: null,         // 本局难度评估（由 game/vibe.js 算，见 applyBoard）
  diffApplied: 'any', // 本局真正用到的目标难度档（用来判断设置里是否有改动待生效）
  /* 挑战：本局限时（毫秒，0 = 不限）与倒计时起点。
   * limitFrom 记的是「起算那一刻的已用时」，所以剩余 = limit - (已用时 - limitFrom)，
   * 中途改限时不会因为之前耗掉的时间直接判负。 */
  limit: 0,
  limitFrom: 0
};

/** 用户设置，会持久化到 localStorage。 */
export const settings = Object.assign({}, DEFAULT_SETTINGS);

/* 设置面板上半部分（棋盘大小 / 目标难度 / 挑战）只是「意向」，选完不立刻作废当前这局，
 * 点「换一局」才把 pending 落到 settings 上并真的出一盘新的。
 * 下半部分的开关（自动打叉 / 音效…）是即时生效的。 */
export const pending = {
  size: 8,
  difficulty: 'any',
  timeLimit: 0,
  noHint: false,
  noUndo: false
};

/* 提示引导的当前进度。提前声明：relayout() 会在 boot() 里先跑，
 * 那时函数体内的 guide 还不能是 undefined。 */
export const guide = { open: false, plan: null, at: 0 };

/* 视图层的可变引用（原闭包里的 var，拆模块后集中放这里）：
 *   cells / chips        棋盘格子与色卡元素数组，换盘时整体重建
 *   undo / redo          撤销重做栈
 *   sheetOpen 等         浮层开关，canPlay() 靠它判断能不能落子
 *   lastConflictCount    上一次渲染时的冲突对数，用来决定要不要响一声 */
export const view = {
  cells: [],
  chips: [],
  lastStates: [],
  undo: [],
  redo: [],
  sheetOpen: false,
  diffOpen: false,
  resultOpen: false,
  lastConflictCount: 0
};

/** 棋盘上有没有玩家的痕迹（皇后或手标 ×）。计时靠它决定要不要起表。 */
export function hasProgress() {
  for (var i = 0; i < state.marks.length; i++) if (state.marks[i] !== 0) return true;
  return false;
}
