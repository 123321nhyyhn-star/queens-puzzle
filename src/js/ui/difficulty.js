/* ============================================================================
 * difficulty.js
 * 难度展示：调 difficulty.js 算分，画提示行右侧的标签和难度说明弹层。
 * ========================================================================== */

import { app, btnDiff, diffBadge, diffBig, diffLead, diffLevelEl, diffScoreEl, diffSheet,
  diffSteps, diffWrap } from '../core/dom.js';
import { pending, state, view } from '../core/state.js';

/* ==========================================================
   难度
   ----------------------------------------------------------
   difficulty.js 会用同一套推理器把这盘推一遍：先纯逻辑，卡住了就
   假设试推，再不行才试错落子。这里只负责展示——提示行右边一个标签，
   点开看分数、分级和「这局到底靠什么推出来的」。
   ========================================================== */
var DIFF_ROWS = [
  { key: 'openSingles', name: '开局可定', cls: 'is-key' },
  { key: 'block', name: '区块封锁', cls: '' },
  { key: 'count', name: '集合计数', cls: '' },
  { key: 'probe', name: '假设试推', cls: 'is-probe' },
  { key: 'guess', name: '试错落子', cls: 'is-guess' }
];

export function updateDiffChip() {
  var v = state.vibe;
  if (!v) { btnDiff.hidden = true; return; }
  btnDiff.hidden = false;
  btnDiff.dataset.tone = v.tone;
  diffLevelEl.textContent = v.level;
  diffScoreEl.textContent = v.score.toFixed(1);
  btnDiff.setAttribute('aria-label',
    '本局难度' + v.level + '，' + v.score.toFixed(1) + ' 分，点按查看难度构成');
}

export function renderDiff() {
  var v = state.vibe;
  if (!v) return;
  var s = v.steps || {};

  diffBig.textContent = v.score.toFixed(1);
  diffBadge.textContent = v.level;
  diffBadge.dataset.tone = v.tone;

  var max = 1;
  for (var i = 0; i < DIFF_ROWS.length; i++) {
    var c = s[DIFF_ROWS[i].key] || 0;
    if (c > max) max = c;
  }

  var html = '';
  for (var j = 0; j < DIFF_ROWS.length; j++) {
    var row = DIFF_ROWS[j], n2 = s[row.key] || 0;
    var w = Math.max(n2 ? 6 : 0, Math.round(100 * n2 / max));
    html += '<div class="diff-step ' + row.cls + (n2 ? '' : ' is-zero') + '">' +
      '<span class="ds-name">' + row.name + '</span>' +
      '<span class="ds-bar"><i style="width:' + w + '%"></i></span>' +
      '<span class="ds-n">×' + n2 + '</span></div>';
  }
  diffSteps.innerHTML = html;

  var n = v.metrics.n;
  var lead = n + '×' + n + ' · 最大色块 ' + (s.areaMax || 0) + ' 格 · ';
  if (s.solved && s.openSingles >= n) {
    lead += '不猜不试，纯推理就能推完';
  } else if (!s.openSingles) {
    lead += '开局没有能直接落子的格，得靠试推';
  } else {
    lead += '开局推理能定 ' + s.openSingles + ' 只，其余靠试推';
  }
  if (s.guess) lead += '（其中 ' + s.guess + ' 只要硬猜）';
  diffLead.textContent = lead;
}

export function openDiff() {
  if (view.diffOpen || !state.vibe) return;
  view.diffOpen = true;
  renderDiff();
  diffWrap.hidden = false;
  if ('inert' in HTMLElement.prototype) app.inert = true;
  else app.setAttribute('aria-hidden', 'true');
  btnDiff.setAttribute('aria-expanded', 'true');
  diffSheet.focus();
}

export function closeDiff(fromChip) {
  if (!view.diffOpen) return;
  view.diffOpen = false;
  diffWrap.hidden = true;
  if ('inert' in HTMLElement.prototype) app.inert = false;
  app.removeAttribute('aria-hidden');
  btnDiff.setAttribute('aria-expanded', 'false');
  if (fromChip) btnDiff.focus();
  else if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}

/* 改尺寸只记在 pending 里，等「换一局」时一起落地 */
