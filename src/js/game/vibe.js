/* ============================================================================
 * vibe.js
 * 本局难度的「人味」评估：转调 engine 目录下的 difficulty.js（经典脚本，
 * 挂在 window.QueensDifficulty 上），失败时返回 null，游戏照常能玩。
 * ========================================================================== */

export function computeVibe(n, regions, solution) {
  try {
    if (!window.QueensDifficulty || !window.QueensDifficulty.vibe) return null;
    return window.QueensDifficulty.vibe(n, regions, solution);
  } catch (e) {
    return null;
  }
}
