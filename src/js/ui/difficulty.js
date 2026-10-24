/* ============================================================================
 * difficulty.js · 信息条上的难度段
 * ----------------------------------------------------------------------------
 * 只有分级和分数，本局难度还没算完时整段收起（刚开局的那一瞬间）。
 * 这一段长在骨架上的信息条里，面板关着也得更新，所以不跟「本局信息页」放一起
 * ——那一页在 ui/panels/info.js。
 * ========================================================================== */

import { btnHud, diffLevelEl, diffScoreEl, diffSeg } from '../core/dom.js';
import { state, view } from '../core/state.js';
import { queenCount } from '../game/rules.js';

export function updateDiffChip() {
  var v = state.vibe;
  if (!v) { diffSeg.hidden = true; paintHudLabel(); return; }
  diffSeg.hidden = false;
  diffSeg.dataset.tone = v.tone;
  diffLevelEl.textContent = v.level;
  diffScoreEl.textContent = v.score.toFixed(1);
  paintHudLabel();
}

/* 整条读成一个按钮，读屏器听到的就是这一句：把几段读数连起来说，
 * 不然只念一句「本局信息」，等于什么都没说。 */
export function paintHudLabel() {
  if (!state.size) return;
  var parts = [
    '棋盘 ' + state.size + '×' + state.size,
    '皇后 ' + queenCount() + '/' + state.size,
    '可撤销 ' + view.undo.length + ' 步'
  ];
  if (state.vibe) parts.push('难度 ' + state.vibe.level + ' ' + state.vibe.score.toFixed(1) + ' 分');
  btnHud.setAttribute('aria-label', '本局信息：' + parts.join('，'));
}
